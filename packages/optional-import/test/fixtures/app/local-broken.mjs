// exists, but its own dependency does not - must route to `fail`, never to `notFound`
import "./no-such-dep-of-mine.mjs";
export const kind = "local-broken";
