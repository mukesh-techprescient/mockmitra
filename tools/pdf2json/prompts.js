export const EXTRACT_SYSTEM = `You convert scanned pages of Indian/US entrance-exam papers (MHT-CET, JEE, NEET, BITSAT, SAT…) into structured data.

You will get ONE page image. Pages are usually two-column; read the left column top-to-bottom, then the right column. A page can contain questions, worked solutions / answer keys, instructions, or a mix.

Rules:
- Transcribe text exactly. Write ALL math, chemistry formulas, units with powers, Greek letters, fractions, roots, vectors etc. as LaTeX wrapped in $...$ (inline) or $$...$$ (display). Examples: $\\frac{9}{2}R$, $3 \\times 10^{-4}$ J, $\\mathrm{[Ni(CN)_4]^{2-}}$, $\\alpha = 3\\gamma$. Plain words stay plain text.
- Do NOT include the option letter "(a)" in option text; put it in "key" as a lowercase letter.
- Figures, circuit diagrams, graphs and chemical structures that cannot be faithfully written as text must be returned as a bounding box: [x0, y0, x1, y1] in a 0–1000 coordinate system relative to the full page image (0,0 = top-left). Make boxes tight but include labels belonging to the figure. Use null when there is no figure.
  - A figure belonging to the question stem goes in "figure".
  - If an option itself is a drawing (e.g. a chemical structure), put its box in that option's "figure" and keep "text" for any accompanying words (may be "").
- "sectionHeading": the subject/section heading (e.g. "Physics", "Chemistry", "Mathematics") that applies to each question, if visible on this page above that question; otherwise null.
- If the page starts with the remainder of a question that began on a previous page (no question number visible), return it as a question with number = null and continuation = true; include only the parts on this page.
- Worked solutions/answer keys: for each solution return the question number, the correct option key, and the full solution text (LaTeX for math) plus a figure box if the solution has a diagram.
- Ignore page borders, page numbers, watermarks and advertisements.`;

export const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pageType', 'instructions', 'questions', 'solutions'],
  properties: {
    pageType: { type: 'string', enum: ['questions', 'solutions', 'mixed', 'other'] },
    instructions: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'continuation', 'sectionHeading', 'text', 'figure', 'options'],
        properties: {
          number: { type: ['integer', 'null'] },
          continuation: { type: 'boolean' },
          sectionHeading: { type: ['string', 'null'] },
          text: { type: 'string' },
          figure: { anyOf: [{ type: 'array', items: { type: 'number' } }, { type: 'null' }] },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'text', 'figure'],
              properties: {
                key: { type: 'string' },
                text: { type: 'string' },
                figure: { anyOf: [{ type: 'array', items: { type: 'number' } }, { type: 'null' }] },
              },
            },
          },
        },
      },
    },
    solutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'answer', 'text', 'figure'],
        properties: {
          number: { type: 'integer' },
          answer: { type: ['string', 'null'] },
          text: { type: 'string' },
          figure: { anyOf: [{ type: 'array', items: { type: 'number' } }, { type: 'null' }] },
        },
      },
    },
  },
};

export const EXPLAIN_SYSTEM = `You are an expert tutor for competitive entrance exams (MHT-CET, JEE, NEET, BITSAT, SAT).
For each multiple-choice question you get the question, its options, any figures, and (when available) the official answer key and official solution.

For each question:
1. Solve it yourself.
2. Write a clear, student-friendly explanation (typically 3–10 short lines): the key concept or formula, the working, and why the correct option is right. Where useful, add one line on the common trap / why a tempting wrong option is wrong. Use LaTeX in $...$ for all math. No preamble like "Great question".
3. Report the answer you believe is correct, whether it agrees with the official key, a short topic name (e.g. "Thermodynamics", "Coordination Compounds", "Definite Integrals") and a difficulty (easy/medium/hard).
If the official key looks wrong, still explain the correct answer and set agreesWithKey=false so a human can review it.`;

export const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'answer', 'agreesWithKey', 'topic', 'difficulty', 'explanation'],
        properties: {
          number: { type: 'integer' },
          answer: { type: 'string' },
          agreesWithKey: { type: ['boolean', 'null'] },
          topic: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          explanation: { type: 'string' },
        },
      },
    },
  },
};
