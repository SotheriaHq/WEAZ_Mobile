export function perfMark(name: string): void {
  if (__DEV__) {
    console.log(`[perf] mark: ${name}`);
  }
}

export function perfMeasure(name: string, fromMark: string): void {
  if (__DEV__) {
    console.log(`[perf] measure: ${name} from ${fromMark}`);
  }
}
