// Money is rounded to the peso only when a total is reported; unit costs keep decimals

// Ceiling that ignores floating point noise (833.0000000001 units is 833, not 834)
export const ceilUnits = (value: number) => Math.ceil(value - 1e-9);

export const floorUnits = (value: number) => Math.floor(value + 1e-9);

export const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
