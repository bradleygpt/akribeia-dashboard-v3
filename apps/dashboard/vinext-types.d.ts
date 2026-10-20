// The "next" module types come from vinext. The build writes the same import into
// next-env.d.ts, but that file is generated and gitignored, and CI typechecks before it
// builds -- so the typecheck gate imports them here.
import "vinext/types";
