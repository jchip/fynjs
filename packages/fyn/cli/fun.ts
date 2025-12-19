import main from "./main";

const { fun } = main;

fun()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
