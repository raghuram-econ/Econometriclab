// Safety net for AI responses that ignore the "no LaTeX" system instruction --
// this app has no LaTeX renderer anywhere (no KaTeX/MathJax, and the
// ReactMarkdown instances in use have no math plugin), so raw LaTeX would
// otherwise appear verbatim (e.g. "\frac{\partial Y}{\partial K}") instead
// of being rendered.
const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ',
  lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω',
  rho: 'ρ', eta: 'η', chi: 'χ', psi: 'ψ', nu: 'ν', xi: 'ξ', zeta: 'ζ', kappa: 'κ',
  Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Gamma: 'Γ', Lambda: 'Λ', Theta: 'Θ', Pi: 'Π', Phi: 'Φ', Psi: 'Ψ',
};

export function sanitizeMath(text: string): string {
  if (!text) return text;
  let out = text;

  // \frac{a}{b} -> (a)/(b); run a few passes for adjacent (non-nested) fractions
  const fracRe = /\\frac\{([^{}]*)\}\{([^{}]*)\}/g;
  for (let i = 0; i < 3 && fracRe.test(out); i++) {
    out = out.replace(fracRe, '($1)/($2)');
  }

  out = out.replace(/\\partial/g, '∂');
  out = out.replace(/\\cdot/g, '·');
  out = out.replace(/\\times/g, '×');
  out = out.replace(/\\left|\\right/g, '');
  out = out.replace(/\\[a-zA-Z]+/g, (m) => GREEK[m.slice(1)] ?? m.slice(1));

  // Strip $$...$$ and $...$ delimiters, keeping the inner content
  out = out.replace(/\$\$([^$]*)\$\$/g, '$1');
  out = out.replace(/\$([^$]*)\$/g, '$1');

  // Leftover LaTeX grouping braces, e.g. from \frac{...}{...} inputs
  out = out.replace(/\{([^{}]*)\}/g, '$1');

  return out;
}
