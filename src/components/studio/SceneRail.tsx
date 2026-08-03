import { useEffect, useRef, type KeyboardEvent } from "react";
import { SCENES, type SceneId } from "@/lib/visualizer/types";

interface SceneRailProps {
  value: SceneId;
  onChange: (scene: SceneId) => void;
}

export function SceneRail({ value, onChange }: SceneRailProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sceneButtonListRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const list = listRef.current;
    const selectedIndex = SCENES.findIndex((scene) => scene.id === value);
    const selected = sceneButtonListRef.current[selectedIndex];
    if (!list || !selected || list.scrollWidth <= list.clientWidth) return;
    const left = selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [value]);

  const handleSceneKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + SCENES.length) % SCENES.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % SCENES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = SCENES.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextScene = SCENES[nextIndex];
    const radioButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
    onChange(nextScene.id);
    radioButtons?.[nextIndex]?.focus();
  };

  return (
    <aside className="scene-rail" aria-label="Visual scenes">
      <div className="rail-title">
        <span>CHOOSE VIEW</span>
        <span>1–5</span>
      </div>
      <div
        className="scene-list"
        role="radiogroup"
        aria-label="Choose a visual scene"
        ref={listRef}
      >
        {SCENES.map((scene, index) => {
          const selected = scene.id === value;
          return (
            <button
              key={scene.id}
              ref={(button) => {
                sceneButtonListRef.current[index] = button;
              }}
              type="button"
              className={`scene-button${selected ? " is-active" : ""}`}
              role="radio"
              aria-checked={selected}
              aria-label={scene.name}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(scene.id)}
              onKeyDown={(event) => handleSceneKeyDown(event, index)}
            >
              <span className="scene-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="scene-name">{scene.shortName}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
