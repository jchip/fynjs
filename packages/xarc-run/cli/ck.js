//
// chalker is the tagged-template color formatter used across the CLI. It is ESM with a
// top-level await, which a CJS package could not require - hence the async loader and
// marker-stripping fallback this module used to carry. As ESM we simply import it.
//
export { default } from "chalker";
