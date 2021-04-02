module.exports = {
  "*.{js,ts}": ["eslint --fix"],
  "*.{md,json,sol}": ["prettier --write"],
  "*.sol": ["solhint"],
};
