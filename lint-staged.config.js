export default {
  '*.{ts,tsx}': [() => 'turbo lint --affected', 'prettier --write'],
  '*.{json,md,css}': ['prettier --write'],
};
