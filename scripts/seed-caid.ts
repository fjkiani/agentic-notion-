import { seedCAID } from "@zeta/db";

seedCAID()
  .then((result) => {
    console.log("🎯 SEED COMPLETE", result);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
