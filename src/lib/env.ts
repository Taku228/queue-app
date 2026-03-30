const stripWrappingQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

export const getPublicEnv = (key: string) => {
  const raw = process.env[key];
  if (!raw) return "";

  return stripWrappingQuotes(raw.trim());
};
