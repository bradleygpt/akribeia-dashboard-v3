// CSS Modules ambient declaration (vinext resolves *.module.css imports at
// build time; TypeScript needs the module shape declared).
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
