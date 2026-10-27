import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  CornerDownRight,
  Download,
  Layers2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

const initialSettings = {
  width: 3,
  style: "solid",
  color: "#7757f6",
  radius: {
    topLeft: 28,
    topRight: 28,
    bottomRight: 28,
    bottomLeft: 28,
  },
  shape: {
    topLeft: "squircle",
    topRight: "squircle",
    bottomRight: "squircle",
    bottomLeft: "squircle",
  },
  background: "#ffffff",
  padding: 48,
};

const borderStyles = ["solid", "dashed", "dotted", "double", "groove", "inset"];
const cornerShapes = ["round", "squircle", "bevel", "notch", "scoop", "square"];
const corners = [
  { key: "topLeft", label: "Top left" },
  { key: "topRight", label: "Top right" },
  { key: "bottomRight", label: "Bottom right" },
  { key: "bottomLeft", label: "Bottom left" },
];
const colorPresets = ["#7757f6", "#f06c54", "#2f9e84", "#202435", "#e7a839"];
const pathViewBox = { width: 320, height: 220 };
const initialPathPoints = [
  { x: 65, y: 12, inX: 26, inY: 12, outX: 104, outY: 12 },
  { x: 308, y: 56, inX: 308, inY: 29, outX: 308, outY: 83 },
  { x: 255, y: 208, inX: 300, inY: 208, outX: 210, outY: 208 },
  { x: 12, y: 164, inX: 12, inY: 191, outX: 12, outY: 137 },
];

function createPathData(points) {
  if (points.length < 2) return "";
  const first = points[0];
  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    commands.push(`C ${current.outX} ${current.outY}, ${next.inX} ${next.inY}, ${next.x} ${next.y}`);
  }
  return `${commands.join(" ")} Z`;
}

function formatPathData(points) {
  return createPathData(points)
    .replace(/(-?\d+(?:\.\d+)?)/g, (value) => Number(value).toFixed(1).replace(/\.0$/, ""));
}

function flattenPath(points, steps = 20) {
  return points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length];
    return Array.from({ length: steps }, (_, step) => {
      const t = step / steps;
      const inverse = 1 - t;
      return {
        x: inverse ** 3 * point.x + 3 * inverse ** 2 * t * point.outX + 3 * inverse * t ** 2 * next.inX + t ** 3 * next.x,
        y: inverse ** 3 * point.y + 3 * inverse ** 2 * t * point.outY + 3 * inverse * t ** 2 * next.inY + t ** 3 * next.y,
      };
    });
  });
}

function splitPathSegment(start, end, progress = 0.5) {
  const interpolate = (first, second) => ({
    x: first.x + (second.x - first.x) * progress,
    y: first.y + (second.y - first.y) * progress,
  });
  const first = { x: start.x, y: start.y };
  const firstControl = { x: start.outX, y: start.outY };
  const secondControl = { x: end.inX, y: end.inY };
  const second = { x: end.x, y: end.y };
  const startControl = interpolate(first, firstControl);
  const middleControl = interpolate(firstControl, secondControl);
  const endControl = interpolate(secondControl, second);
  const leftControl = interpolate(startControl, middleControl);
  const rightControl = interpolate(middleControl, endControl);
  const anchor = interpolate(leftControl, rightControl);

  return {
    start: { ...start, outX: startControl.x, outY: startControl.y },
    point: {
      x: anchor.x,
      y: anchor.y,
      inX: leftControl.x,
      inY: leftControl.y,
      outX: rightControl.x,
      outY: rightControl.y,
    },
    end: { ...end, inX: endControl.x, inY: endControl.y },
  };
}

function isPointInsidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pathScaleToContain(points, contentSize, padding = 12) {
  const polygon = flattenPath(points);
  const center = { x: pathViewBox.width / 2, y: pathViewBox.height / 2 };
  const halfWidth = (contentSize.width + padding * 2) / 2;
  const halfHeight = (contentSize.height + padding * 2) / 2;
  const samples = [];

  for (let index = 0; index <= 8; index += 1) {
    const progress = index / 8;
    samples.push({ x: center.x - halfWidth + progress * halfWidth * 2, y: center.y - halfHeight });
    samples.push({ x: center.x - halfWidth + progress * halfWidth * 2, y: center.y + halfHeight });
    samples.push({ x: center.x - halfWidth, y: center.y - halfHeight + progress * halfHeight * 2 });
    samples.push({ x: center.x + halfWidth, y: center.y - halfHeight + progress * halfHeight * 2 });
  }

  const containsAtScale = (scale) => samples.every((sample) =>
    isPointInsidePolygon({
      x: center.x + (sample.x - center.x) / scale,
      y: center.y + (sample.y - center.y) / scale,
    }, polygon),
  );

  if (containsAtScale(1)) return 1;
  if (!isPointInsidePolygon(center, polygon)) return 1;

  let lower = 1;
  let upper = 2;
  while (upper < 16 && !containsAtScale(upper)) upper *= 2;
  if (!containsAtScale(upper)) return upper;

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (containsAtScale(middle)) upper = middle;
    else lower = middle;
  }
  return upper;
}

function scalePathPoints(points, scale) {
  return points.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
    inX: point.inX * scale,
    inY: point.inY * scale,
    outX: point.outX * scale,
    outY: point.outY * scale,
  }));
}

function createPathBorderImage(pathData, settings, width, height) {
  const dashAttributes = settings.style === "dashed"
    ? ' stroke-dasharray="8 5"'
    : settings.style === "dotted"
      ? ' stroke-dasharray="1 5" stroke-linecap="round"'
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${pathData}" fill="none" stroke="${settings.color}" stroke-width="${settings.width}"${dashAttributes}/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function App() {
  const [settings, setSettings] = useState(initialSettings);
  const [borderMode, setBorderMode] = useState("corners");
  const [pathPoints, setPathPoints] = useState(initialPathPoints);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [dragTarget, setDragTarget] = useState(null);
  const pathEditorRef = useRef(null);
  const clipContentRef = useRef(null);
  const [contentSize, setContentSize] = useState({ width: 268, height: 140 });
  const clipPathData = useMemo(() => formatPathData(pathPoints), [pathPoints]);
  const pathScale = useMemo(() => pathScaleToContain(pathPoints, contentSize), [contentSize, pathPoints]);
  const scaledPathData = useMemo(
    () => formatPathData(scalePathPoints(pathPoints, pathScale)),
    [pathPoints, pathScale],
  );
  const clipPathCss = `path("${scaledPathData}")`;
  const pathWidth = Math.round(pathViewBox.width * pathScale);
  const pathHeight = Math.round(pathViewBox.height * pathScale);
  const pathBorderImage = createPathBorderImage(scaledPathData, settings, pathWidth, pathHeight);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    const content = clipContentRef.current;
    if (!content) return undefined;

    const updateContentSize = () => {
      const bounds = content.getBoundingClientRect();
      setContentSize((current) => current.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height });
    };

    updateContentSize();
    const observer = new ResizeObserver(updateContentSize);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const css = useMemo(
    () => {
      const border = `  border: ${settings.width}px ${settings.style} ${settings.color};`;
      if (borderMode === "clip-path") {
        return `.border-card {\n  position: relative;\n  isolation: isolate;\n  display: grid;\n  place-items: center;\n  width: ${pathWidth}px;\n  height: ${pathHeight}px;\n  border: 0;\n}\n\n.border-card::before {\n  content: "";\n  position: absolute;\n  inset: 0;\n  z-index: 0;\n  background: ${settings.background};\n  clip-path: ${clipPathCss};\n}\n\n.border-card::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  z-index: 1;\n  background: ${pathBorderImage} center / 100% 100% no-repeat;\n  pointer-events: none;\n}\n\n.border-card > * {\n  position: relative;\n  z-index: 2;\n}`;
      }
      const radii = corners.map(({ key }) => `${settings.radius[key]}px`).join(" ");
      const shapes = corners.map(({ key }) => settings.shape[key]).join(" ");
      return `.border-card {\n${border}\n  border-radius: ${radii};\n  corner-shape: ${shapes};\n}`;
    },
    [borderMode, clipPathCss, pathBorderImage, pathHeight, pathWidth, settings],
  );

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const updateCorner = (property, corner, value) => setSettings((current) => ({
    ...current,
    [property]: { ...current[property], [corner]: value },
  }));

  function getPathEditorPoint(event) {
    const bounds = pathEditorRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(pathViewBox.width, ((event.clientX - bounds.left) / bounds.width) * pathViewBox.width)),
      y: Math.max(0, Math.min(pathViewBox.height, ((event.clientY - bounds.top) / bounds.height) * pathViewBox.height)),
    };
  }

  function movePathPoint(event) {
    if (!dragTarget) return;
    const position = getPathEditorPoint(event);
    setPathPoints((current) => current.map((point, index) => {
      if (index !== dragTarget.index) return point;
      if (dragTarget.handle === "anchor") {
        const dx = position.x - point.x;
        const dy = position.y - point.y;
        return {
          ...point,
          x: position.x,
          y: position.y,
          inX: point.inX + dx,
          inY: point.inY + dy,
          outX: point.outX + dx,
          outY: point.outY + dy,
        };
      }
      return { ...point, [`${dragTarget.handle}X`]: position.x, [`${dragTarget.handle}Y`]: position.y };
    }));
  }

  function addPathPoint() {
    if (pathPoints.length >= 12) return;
    const startIndex = Math.min(selectedPoint, pathPoints.length - 1);
    const endIndex = (startIndex + 1) % pathPoints.length;
    const split = splitPathSegment(pathPoints[startIndex], pathPoints[endIndex]);
    const updatedPoints = pathPoints.map((point, index) => {
      if (index === startIndex) return split.start;
      if (index === endIndex) return split.end;
      return point;
    });
    const index = startIndex + 1;
    updatedPoints.splice(index, 0, split.point);
    setPathPoints(updatedPoints);
    setSelectedPoint(index);
  }

  function removePathPoint() {
    if (pathPoints.length <= 3) return;
    setPathPoints((current) => current.filter((_, index) => index !== selectedPoint));
    setSelectedPoint((current) => Math.max(0, current - 1));
  }

  async function copyCss() {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Could not copy CSS to the clipboard.", error);
    }
  }

  function downloadCss() {
    const file = new Blob([css], { type: "text/css" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "border-card.css";
    link.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setSettings(initialSettings);
    setPathPoints(initialPathPoints);
    setSelectedPoint(0);
    setBorderMode("corners");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Border Studio home">
          <span className="brand-mark"><Layers2 size={19} strokeWidth={2.2} /></span>
          <span>border<span className="brand-light">studio</span></span>
        </a>
        <div className="topbar-right">
          <span className="beta-tag"><Sparkles size={12} /> CSS playground</span>
          <span className="avatar">J</span>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> DESIGN TOOLKIT / 01</p>
          <h1>Make borders<br /><span>feel like yours.</span></h1>
          <p className="intro-copy">Shape the details. Preview your CSS in real time, then take the code with you.</p>
        </div>
        <div className="intro-note">
          <CornerDownRight size={19} />
          <span>Good design lives<br />in the little things.</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="controls-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">01 — CUSTOMIZE</span>
              <h2>Border settings</h2>
            </div>
            <button className="icon-button reset-button" onClick={reset} title="Reset settings" aria-label="Reset settings">
              <RotateCcw size={15} />
            </button>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="border-width">Thickness</label>
              <output>{settings.width}<span> px</span></output>
            </div>
            <input id="border-width" type="range" min="0" max="20" value={settings.width}
              onChange={(event) => update("width", Number(event.target.value))} />
            <div className="range-ends"><span>0 px</span><span>20 px</span></div>
          </div>

          <div className="control-group">
            <label htmlFor="border-style">Line style</label>
            <div className="select-wrap">
              <select id="border-style" value={settings.style} onChange={(event) => update("style", event.target.value)}>
                {borderStyles.map((style) => <option key={style} value={style}>{style[0].toUpperCase() + style.slice(1)}</option>)}
              </select>
              <ChevronDown size={15} />
            </div>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="border-color">Border color</label>
              <span className="hex-value">{settings.color.toUpperCase()}</span>
            </div>
            <div className="color-row">
              <label className="color-picker" htmlFor="border-color" style={{ "--picker-color": settings.color }}>
                <input id="border-color" type="color" value={settings.color} onChange={(event) => update("color", event.target.value)} />
              </label>
              <div className="color-presets" aria-label="Color presets">
                {colorPresets.map((color) => (
                  <button key={color} className={`color-swatch ${settings.color.toLowerCase() === color ? "selected" : ""}`}
                    style={{ "--swatch-color": color }} onClick={() => update("color", color)}
                    aria-label={`Set border color to ${color}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="control-group shape-group">
            <div className="shape-heading">
              <span className="corner-settings-label">Shape mode</span>
              <span className="experimental-tag"><Sparkles size={10} /> EXPERIMENTAL</span>
            </div>
            <div className="shape-mode-switch" role="group" aria-label="Border shape mode">
              <button type="button" className={borderMode === "corners" ? "shape-mode-button active" : "shape-mode-button"}
                  aria-pressed={borderMode === "corners"} onClick={() => setBorderMode("corners")}>Corners</button>
              <button type="button" className={borderMode === "clip-path" ? "shape-mode-button active" : "shape-mode-button"}
                  aria-pressed={borderMode === "clip-path"} onClick={() => setBorderMode("clip-path")}>Clip path</button>
            </div>
            {borderMode === "corners" ? (
              <>
                  <div className="corner-controls">
                    {corners.map(({ key, label }) => (
                      <div className="corner-control" key={key}>
                        <div className="control-label-row">
                          <label htmlFor={`corner-shape-${key}`}>{label}</label>
                          <output htmlFor={`corner-radius-${key}`}>{settings.radius[key]}<span> px</span></output>
                        </div>
                        <div className="select-wrap">
                          <select id={`corner-shape-${key}`} value={settings.shape[key]}
                            onChange={(event) => updateCorner("shape", key, event.target.value)}>
                            {cornerShapes.map((shape) => <option key={shape} value={shape}>{shape[0].toUpperCase() + shape.slice(1)}</option>)}
                          </select>
                          <ChevronDown size={15} />
                        </div>
                        <input id={`corner-radius-${key}`} type="range" min="0" max="100" value={settings.radius[key]}
                          aria-label={`${label} corner radius`}
                          onChange={(event) => updateCorner("radius", key, Number(event.target.value))} />
                        <div className="range-ends"><span>0 px</span><span>100 px</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="hint">Uses the emerging <code>corner-shape</code> CSS property. Browser support may vary.</p>
              </>
            ) : (
              <div className="path-editor">
                  <p className="hint">Drag anchors or Bézier handles to shape the path. Add point splits the selected curve and keeps its shape. The path uses a 320 × 220 px viewBox.</p>
                  <svg ref={pathEditorRef} className="path-editor-canvas" viewBox={`0 0 ${pathViewBox.width} ${pathViewBox.height}`}
                    role="img" aria-label="Bézier clip path editor"
                    onPointerMove={movePathPoint}
                    onPointerUp={() => setDragTarget(null)}
                    onPointerCancel={() => setDragTarget(null)}>
                    <path d={clipPathData} className="path-editor-fill" />
                    {pathPoints.map((point, index) => (
                      <g key={index}>
                        <line x1={point.inX} y1={point.inY} x2={point.x} y2={point.y} className="path-handle-line" />
                        <line x1={point.x} y1={point.y} x2={point.outX} y2={point.outY} className="path-handle-line" />
                        {[
                          { handle: "in", x: point.inX, y: point.inY },
                          { handle: "out", x: point.outX, y: point.outY },
                        ].map(({ handle, x, y }) => (
                          <circle key={handle} cx={x} cy={y} r="4" className="path-handle"
                            aria-label={`Point ${index + 1} ${handle} handle`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setSelectedPoint(index);
                              setDragTarget({ index, handle });
                              pathEditorRef.current.setPointerCapture(event.pointerId);
                            }} />
                        ))}
                        <circle cx={point.x} cy={point.y} r="6"
                          className={selectedPoint === index ? "path-anchor selected" : "path-anchor"}
                          aria-label={`Select path point ${index + 1}`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelectedPoint(index);
                            setDragTarget({ index, handle: "anchor" });
                            pathEditorRef.current.setPointerCapture(event.pointerId);
                          }} />
                      </g>
                    ))}
                  </svg>
                  <div className="path-editor-actions">
                    <span>Point {selectedPoint + 1} of {pathPoints.length}</span>
                    <div>
                      <button type="button" className="path-action-button" onClick={addPathPoint} disabled={pathPoints.length >= 12}>
                        Add point
                      </button>
                      <button type="button" className="path-action-button" onClick={removePathPoint} disabled={pathPoints.length <= 3}>
                        Remove point
                      </button>
                    </div>
                  </div>
                  <p className="hint">The path automatically scales outward to contain the preview content and padding.</p>
              </div>
            )}
          </div>

          <div className="control-group compact-options">
            <div className="control-label-row">
              <label htmlFor="card-fill">Preview fill</label>
              <span className="hex-value">{settings.background.toUpperCase()}</span>
            </div>
            <div className="color-row">
              <label className="color-picker" htmlFor="card-fill" style={{ "--picker-color": settings.background }}>
                <input id="card-fill" type="color" value={settings.background} onChange={(event) => update("background", event.target.value)} />
              </label>
              <span className="field-note">Card background</span>
            </div>
          </div>
        </aside>

        <div className="preview-column">
          <div className="preview-heading">
            <div>
              <span className="section-index">02 — LIVE PREVIEW</span>
              <h2>Your canvas</h2>
            </div>
            <span className="live-status"><span /> LIVE</span>
          </div>
          <div className={borderMode === "clip-path" ? "canvas canvas-clip-path" : "canvas"}>
            <div className="canvas-grid" />
            <div className="canvas-label"><span>PREVIEW</span><span>320 × 240</span></div>
            <div className="preview-card" style={{
              border: borderMode === "corners" ? `${settings.width}px ${settings.style} ${settings.color}` : "0",
              borderRadius: corners.map(({ key }) => `${settings.radius[key]}px`).join(" "),
              cornerShape: corners.map(({ key }) => settings.shape[key]).join(" "),
              width: borderMode === "clip-path" ? `${pathWidth}px` : undefined,
              height: borderMode === "clip-path" ? `${pathHeight}px` : undefined,
              minHeight: borderMode === "clip-path" ? "0" : undefined,
              maxWidth: borderMode === "clip-path" ? "none" : undefined,
              boxShadow: borderMode === "clip-path" ? "none" : undefined,
              backgroundColor: borderMode === "corners" ? settings.background : "transparent",
              padding: borderMode === "clip-path"
                ? "0"
                : `${Math.min(settings.padding, Math.max(12, Math.max(...Object.values(settings.radius)) + 20))}px`,
            }}>
              {borderMode === "clip-path" && (
                <>
                  <div className="clip-path-surface" style={{
                    clipPath: clipPathCss,
                    backgroundColor: settings.background,
                  }} />
                  <svg className="clip-path-border" viewBox={`0 0 ${pathWidth} ${pathHeight}`}
                    preserveAspectRatio="none" aria-hidden="true">
                    <path d={scaledPathData} fill="none" stroke={settings.color} strokeWidth={settings.width}
                      strokeDasharray={settings.style === "dashed" ? "8 5" : settings.style === "dotted" ? "1 5" : undefined}
                      strokeLinecap={settings.style === "dotted" ? "round" : undefined} />
                  </svg>
                </>
              )}
              <div ref={clipContentRef}
                className={borderMode === "clip-path" ? "card-content clip-path-content" : "card-content"}>
                <div className="mini-logo"><span /></div>
                <span className="card-kicker">A LITTLE PREVIEW</span>
                <h3>Details make<br />the difference.</h3>
                <p>Your new favorite card, styled just right.</p>
                <button className="preview-cta">Explore <span>↗</span></button>
              </div>
            </div>
            <div className="canvas-caption"><span className="caption-line" /> A little shape goes a long way</div>
          </div>

          <div className="code-panel">
            <div className="code-heading">
              <div className="code-title"><span className="code-icon">{`{ }`}</span><div><span className="section-index">03 — TAKE IT WITH YOU</span><h2>Generated CSS</h2></div></div>
              <div className="code-actions">
                <button className="icon-button" onClick={downloadCss}
                  title="Download CSS" aria-label="Download CSS"><Download size={15} /></button>
                <button className="copy-button" onClick={copyCss}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy CSS"}
                </button>
              </div>
            </div>
            <pre className="code-output"><code>
              {borderMode === "clip-path" ? css : (
                <>
                  <span className="code-selector">.border-card</span> <span className="code-brace">{"{"}</span>{"\n"}
                  {"  "}<span className="code-property">border</span>: <span className="code-value">{settings.width}px {settings.style} {settings.color}</span>;{"\n"}
                  {"  "}<span className="code-property">border-radius</span>: <span className="code-value">{corners.map(({ key }) => `${settings.radius[key]}px`).join(" ")}</span>;{"\n"}
                  {"  "}<span className="code-property">corner-shape</span>: <span className="code-value">{corners.map(({ key }) => settings.shape[key]).join(" ")}</span>;{"\n"}
                  <span className="code-brace">{"}"}</span>
                </>
              )}
            </code></pre>
            <div className="code-footer"><span><span className="code-dot" /> CSS updates as you create</span><span>Ready for your project <span className="footer-arrow">↗</span></span></div>
          </div>
        </div>
      </section>
      <footer className="footer"><span>Made for the details.</span><span>Border Studio <span className="footer-version">© 2025</span></span></footer>
    </main>
  );
}

export default App;
