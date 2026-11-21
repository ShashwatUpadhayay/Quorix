import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def load_env(path: str | os.PathLike[str] | None = None) -> None:
    env_path = Path(path or ".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


class OllamaError(RuntimeError):
    pass


@dataclass
class OllamaResult:
    data: dict[str, Any]
    raw: str
    attempts: int
    latency_ms: int


class OllamaClient:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        load_env()
        self.base_url = (
            base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        ).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
        self.timeout_seconds = timeout_seconds or float(
            os.getenv("OLLAMA_TIMEOUT_SECONDS", "120")
        )
        self.keep_alive = os.getenv("OLLAMA_KEEP_ALIVE", "30m")

    def reachable(self) -> bool:
        try:
            with urllib.request.urlopen(
                f"{self.base_url}/api/tags", timeout=3
            ) as response:
                return response.status == 200
        except (urllib.error.URLError, TimeoutError, OSError):
            return False

    def list_models(self) -> list[str]:
        request = urllib.request.Request(
            f"{self.base_url}/api/tags",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return [row["name"] for row in payload.get("models", [])]

    def generate_json(
        self,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        temperature: float = 0.7,
    ) -> OllamaResult:
        started = time.monotonic()
        last_error: Exception | None = None
        max_attempts = int(os.getenv("OLLAMA_MAX_RETRIES", "2")) + 1

        for attempt in range(1, max_attempts + 1):
            body = json.dumps(
                {
                    "model": self.model,
                    "stream": False,
                    "format": schema,
                    "keep_alive": self.keep_alive,
                    "options": {
                        "temperature": temperature,
                        "num_predict": int(
                            os.getenv("OLLAMA_MAX_OUTPUT_TOKENS", "1200")
                        ),
                    },
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                }
            ).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(
                    request, timeout=self.timeout_seconds
                ) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if payload.get("error"):
                    raise OllamaError(str(payload["error"]))
                raw = (
                    payload.get("message", {}).get("content")
                    or payload.get("response")
                    or ""
                ).strip()
                if not raw:
                    raise OllamaError("Ollama returned an empty response")
                data = self._extract_json(raw)
                return OllamaResult(
                    data=data,
                    raw=raw,
                    attempts=attempt,
                    latency_ms=int((time.monotonic() - started) * 1000),
                )
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OllamaError) as error:
                last_error = error
                if attempt < max_attempts:
                    time.sleep(min(2 ** (attempt - 1), 4))

        raise OllamaError(
            f"Ollama request failed after {max_attempts} attempts: "
            f"{last_error or 'unknown error'}"
        )

    @staticmethod
    def _extract_json(raw: str) -> dict[str, Any]:
        text = raw.strip()
        if text.startswith("```"):
            text = text.replace("```json", "", 1).replace("```JSON", "", 1)
            text = text.strip().strip("`").strip()
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start < 0 or end <= start:
                raise
            value = json.loads(text[start : end + 1])
        if not isinstance(value, dict):
            raise OllamaError("Ollama response JSON must be an object")
        return value
