// CEC ticket rows use ! for a reserved-seat winner as well as * for a winner.
// A dash is not a winning mark. Keep parsing explicit rather than truthy.
export const cecElected = value => value === true || ['*', '!', 'Y', 'YES', 'TRUE', '1'].includes(String(value ?? '').trim().toUpperCase());
