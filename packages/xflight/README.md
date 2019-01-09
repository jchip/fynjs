# xflight

```js
const Xflight = require("xflight");
const xfl = new Xflight();
xfl.promise(url, () => {
  return fetch(url);
});
```
