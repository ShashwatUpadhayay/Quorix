"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Server,
  Database,
  Layers,
  Globe,
  Radio,
  HardDrive,
  Users,
  Cpu,
  Trash2,
  RefreshCw,
  Plus,
} from "lucide-react";
import "@excalidraw/excalidraw/index.css";

// Dynamic import with ssr: false as required for browser-only canvas
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#FAF8F5] text-xs font-mono text-[#6E6B65] gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-[#1A1918]" />
        <span>Loading architectural whiteboard canvas...</span>
      </div>
    ),
  }
);

interface ExcalidrawElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

interface ExcalidrawApiLike {
  getSceneElements: () => readonly ExcalidrawElementLike[];
  updateScene: (sceneData: {
    elements?: readonly ExcalidrawElementLike[];
    appState?: Record<string, unknown>;
  }) => void;
  resetScene: () => void;
}

interface SystemDesignCanvasProps {
  initialDiagramJson?: string;
  onChange?: (elementsJson: string, elementsCount: number) => void;
  readOnly?: boolean;
}

interface PaletteItem {
  type: string;
  label: string;
  shape: "rectangle" | "ellipse" | "diamond";
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const COMPONENT_PALETTE: PaletteItem[] = [
  {
    type: "Client",
    label: "Client App",
    shape: "rectangle",
    color: "#e7f5ff",
    icon: Users,
    description: "Mobile, Web, or IoT client",
  },
  {
    type: "CDN",
    label: "CDN / Edge",
    shape: "rectangle",
    color: "#e6fcf5",
    icon: Globe,
    description: "Edge caching & DDoS shield",
  },
  {
    type: "Load Balancer",
    label: "Load Balancer",
    shape: "rectangle",
    color: "#f3f0ff",
    icon: Layers,
    description: "L4/L7 traffic distributor",
  },
  {
    type: "API Gateway",
    label: "API Gateway",
    shape: "rectangle",
    color: "#f8f9fa",
    icon: Server,
    description: "Auth, routing & rate limiting",
  },
  {
    type: "Service",
    label: "Core Service",
    shape: "rectangle",
    color: "#fff9db",
    icon: Cpu,
    description: "Application microservice",
  },
  {
    type: "Cache",
    label: "Redis Cache",
    shape: "rectangle",
    color: "#ffe3e3",
    icon: HardDrive,
    description: "In-memory caching layer",
  },
  {
    type: "Database",
    label: "PostgreSQL DB",
    shape: "ellipse",
    color: "#d3f9d8",
    icon: Database,
    description: "Persistent transactional database",
  },
  {
    type: "Queue",
    label: "Kafka Queue",
    shape: "diamond",
    color: "#fff3bf",
    icon: Radio,
    description: "Asynchronous event stream",
  },
];

export default function SystemDesignCanvas({
  initialDiagramJson,
  onChange,
  readOnly = false,
}: SystemDesignCanvasProps) {
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApiLike | null>(null);
  const [elementsCount, setElementsCount] = useState(0);
  const lastEmittedRef = useRef<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Parse initial elements safely
  const initialElements = React.useMemo(() => {
    if (!initialDiagramJson) return undefined;
    try {
      const parsed = JSON.parse(initialDiagramJson);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.elements)) return parsed.elements;
    } catch {
      // Ignored
    }
    return undefined;
  }, [initialDiagramJson]);

  // Handle scene change from Excalidraw
  const handleSceneChange = useCallback(
    (elements: readonly ExcalidrawElementLike[]) => {
      const active = elements.filter((el) => !el.isDeleted);
      setElementsCount(active.length);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        try {
          const serialized = JSON.stringify(active);
          if (serialized !== lastEmittedRef.current) {
            lastEmittedRef.current = serialized;
            onChange?.(serialized, active.length);
          }
        } catch {
          // Ignored
        }
      }, 500);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Drop pre-labeled shape from the component palette onto the whiteboard
  const handleAddPaletteComponent = useCallback(
    (item: PaletteItem) => {
      if (!excalidrawApi || readOnly) return;

      const currentElements = excalidrawApi.getSceneElements();
      const activeCount = currentElements.filter((e) => !e.isDeleted).length;

      // Stagger layout coordinates
      const col = activeCount % 4;
      const row = Math.floor(activeCount / 4);
      const x = 120 + col * 180;
      const y = 80 + row * 130;

      const shapeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const width = item.shape === "diamond" ? 130 : 140;
      const height = item.shape === "diamond" ? 90 : 65;

      const shapeElement: ExcalidrawElementLike = {
        id: shapeId,
        type: item.shape,
        x,
        y,
        width,
        height,
        angle: 0,
        strokeColor: "#1A1918",
        backgroundColor: item.color,
        fillStyle: "solid",
        strokeWidth: 1.5,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: [{ type: "text", id: textId }],
        updated: Date.now(),
        link: null,
        locked: false,
      };

      const textElement: ExcalidrawElementLike = {
        id: textId,
        type: "text",
        x: x + 10,
        y: y + (item.shape === "diamond" ? 32 : 20),
        width: width - 20,
        height: 25,
        angle: 0,
        strokeColor: "#1A1918",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: item.label,
        originalText: item.label,
        fontSize: 14,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: shapeId,
      };

      const newElements = [...currentElements, shapeElement, textElement];
      excalidrawApi.updateScene({ elements: newElements });
      handleSceneChange(newElements);
    },
    [excalidrawApi, readOnly, handleSceneChange]
  );

  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearWhiteboard = useCallback(() => {
    if (!excalidrawApi || readOnly) return;
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3500);
      return;
    }
    setConfirmClear(false);
    excalidrawApi.resetScene();
    handleSceneChange([]);
  }, [excalidrawApi, readOnly, confirmClear, handleSceneChange]);

  return (
    <div className="flex flex-col h-full w-full bg-[#FFFFFF] border border-[#E5E2DA] rounded-xl overflow-hidden shadow-xs">
      {/* ============================================================ */}
      {/* COMPONENT PALETTE STRIP */}
      {/* ============================================================ */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#F2EFE9] border-b border-[#E5E2DA] shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase text-[#6E6B65] mr-1 hidden sm:inline">
              Palette:
            </span>
            {COMPONENT_PALETTE.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleAddPaletteComponent(item)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#D5D1C7] bg-[#FFFFFF] text-[#1A1918] hover:bg-[#FAF8F5] hover:border-[#1A1918] active:scale-[0.97] transition-all shadow-xs"
                  title={`Add ${item.label} (${item.description})`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-[#1A1918]" />
                  <span>{item.type}</span>
                  <Plus className="w-2.5 h-2.5 text-[#8E8B84]" />
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#6E6B65] hidden md:inline">
              {elementsCount} components
            </span>
            <button
              type="button"
              onClick={handleClearWhiteboard}
              className={`px-2 py-1.5 rounded-md border text-xs font-mono transition-colors flex items-center gap-1 ${
                confirmClear
                  ? "border-[#B45332] bg-[#FEF2F2] text-[#B45332] font-semibold"
                  : "border-[#E5E2DA] bg-[#FFFFFF] text-[#8E8B84] hover:text-[#B45332] hover:bg-[#FEF2F2]"
              }`}
              title={confirmClear ? "Click again to confirm" : "Clear Whiteboard"}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmClear && <span className="text-[10px]">Confirm?</span>}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EXCALIDRAW CANVAS VIEWPORT */}
      {/* ============================================================ */}
      <div className="flex-1 w-full h-[500px] min-h-[450px] relative">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawApi(api as unknown as ExcalidrawApiLike)}
          initialData={initialElements ? { elements: initialElements } : undefined}
          onChange={(elements) =>
            handleSceneChange(elements as readonly ExcalidrawElementLike[])
          }
          viewModeEnabled={readOnly}
          zenModeEnabled={false}
          gridModeEnabled={true}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: true,
            },
          }}
        />
      </div>
    </div>
  );
}
