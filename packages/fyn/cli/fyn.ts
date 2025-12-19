import main from "./main";

const { run } = main;

if (require.main === module) {
  run();
}

export = run;
