/**
 * Sample function demonstrating dual-mode package
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/**
 * Sample function with numeric operation
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Sample type export
 */
export type GreetOptions = {
  name: string;
  greeting?: string;
};

/**
 * Sample function using type
 */
export function greetWithOptions(options: GreetOptions): string {
  const greeting = options.greeting ?? "Hello";
  return `${greeting}, ${options.name}!`;
}
