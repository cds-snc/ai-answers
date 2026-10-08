import React, { useEffect, useId, useState } from 'react';

/**
 * Draws a ```mermaid code block the way GitHub does, so the system card's
 * flowchart stays a single source in SYSTEM_CARD*.md.
 *
 * mermaid is large, so it's imported only when a diagram is on screen. The
 * SVG's node labels read out of order, so it's exposed as one image named by
 * `label`; the card follows each diagram with its own text description.
 * If mermaid fails, the source is shown instead.
 */
const MermaidDiagram = ({ code, label }) => {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);
  // useId() returns ":r0:"-style ids; mermaid needs a valid element id.
  const diagramId = `mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        const result = await mermaid.render(diagramId, code);
        if (!cancelled) setSvg(result.svg);
      })
      .catch((err) => {
        console.error('Failed to draw mermaid diagram:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  if (failed) {
    return (
      <pre className="mb-400">
        <code>{code}</code>
      </pre>
    );
  }
  if (!svg) return null;

  return (
    <div
      className="system-card-diagram mb-400"
      role="img"
      aria-label={label}
      // mermaid's own output, rendered with securityLevel 'strict' (sanitized).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default MermaidDiagram;
