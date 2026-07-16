// Central lexicon class label + colour map for the Brand Visibility dashboard.
// Class keys mirror the Python lexicon (keyword_classes.class_key).
export const CLASS_LABELS = {
  A: { short: 'AI Models',         color: '#A78BFA', priority: 'P1' },
  B: { short: 'Agent Frameworks',  color: '#60A5FA', priority: 'P0' },
  C: { short: 'Voice AI',          color: '#00F5D4', priority: 'P0' }, // teal, primary
  D: { short: 'Unit Economics',    color: '#F59E0B', priority: 'P1' },
  E: { short: 'Language Moat',     color: '#10B981', priority: 'P0' },
  F: { short: 'Vertical Builders', color: '#C4B5FD', priority: 'P1' },
  G: { short: 'AI Terminology',    color: '#A1A1AA', priority: 'P2' },
  K: { short: 'Buying Intent',     color: '#EF4444', priority: 'high' },
  NOISE: { short: 'Noise',         color: '#6B7785', priority: '' },
};

export function getClassLabel(classId) {
  if (!classId) return { short: 'Unclassified', color: '#6B7785' };
  return CLASS_LABELS[classId] || { short: classId, color: '#6B7785' };
}
