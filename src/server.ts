// ts-node-dev doesn't honor tsconfig's `include` glob by default, so this
// makes the Express.Request.userId ambient type augmentation visible here.
/// <reference path="./types/express.d.ts" />
import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Dream XI API listening on port ${PORT}`);
});
