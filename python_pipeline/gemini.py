import json
import os
import time
import urllib.error
import urllib.request
import random
from dataclasses import dataclass
from typing import Any

from .ollama import load_env


class GeminiError(RuntimeError):
    pass


@dataclass
class GeminiResult:
    data: dict[str, Any]
    raw: str
    attempts: int
    latency_ms: int


class GeminiClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 120,
    ) -> None:
        load_env()
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self.base_url = (
            base_url
            or os.getenv(
                "GEMINI_API_BASE_URL",
                "https://generativelanguage.googleapis.com/v1beta",
            )
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds

    def reachable(self) -> bool:
        return bool(self.api_key)

    def generate_json(
        self,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        temperature: float = 0.7,
    ) -> GeminiResult:
        if not self.api_key:
            raise GeminiError("GEMINI_API_KEY is not configured")

        started = time.monotonic()
        url = (
            f"{self.base_url}/models/"
            f"{self.model}:generateContent"
        )
        body = json.dumps({
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": 1200,
                "responseMimeType": "application/json",
                "responseSchema": schema,
            },
        }).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )

        max_attempts = max(
            1,
            int(os.getenv("GEMINI_MAX_RETRIES", "4")),
        )
        retryable = {429, 503, 504}
        payload: dict[str, Any] | None = None
        last_error: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                with urllib.request.urlopen(
                    request, timeout=self.timeout_seconds
                ) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", "replace")[:500]
                last_error = GeminiError(
                    f"Gemini returned HTTP {error.code}: {detail}"
                )
                if error.code not in retryable or attempt == max_attempts:
                    raise last_error
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last_error = GeminiError(f"Gemini request failed: {error}")
                if attempt == max_attempts:
                    raise last_error

            base_delay = int(os.getenv("GEMINI_RETRY_BASE_MS", "1000")) / 1000
            delay = min(15.0, base_delay * (2 ** (attempt - 1)))
            delay += random.random() * 0.5
            time.sleep(delay)

        if payload is None:
            raise last_error or GeminiError("Gemini retries exhausted")

        raw = "".join(
            part.get("text", "")
            for candidate in payload.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
        ).strip()
        if not raw:
            raise GeminiError("Gemini returned an empty response")

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            raise GeminiError("Gemini response was not valid JSON") from error
        if not isinstance(data, dict):
            raise GeminiError("Gemini response JSON must be an object")

        return GeminiResult(
            data=data,
            raw=raw,
            attempts=1,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
