import { SCENES, type SceneId } from "@/lib/visualizer/types";

interface SceneRailProps {
  value: SceneId;
  onChange: (scene: SceneId) => void;
}

export function SceneRail({ value, onChange }: SceneRailProps) {
  return (
    <aside className="scene-rail" aria-label="Visual scenes">
      <div className="rail-title">
        <span>SCENES</span>
        <span>05</span>
      </div>
      <div className="scene-list" role="radiogroup" aria-label="Choose a visual scene">
        {SCENES.map((scene, index) => {
          const selected = scene.id === value;
          return (
            <button
              key={scene.id}
              type="button"
              className={`scene-button${selected ? " is-active" : ""}`}
              role="radio"
              aria-checked={selected}
              aria-label={scene.name}
              onClick={() => onChange(scene.id)}
            >
              <span className={`scene-glyph scene-glyph-${scene.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="scene-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="scene-name">{scene.shortName}</span>
            </button>
          );
        })}
      </div>
      <p className="rail-hint">1–5 TO SWITCH</p>
    </aside>
  );
}
