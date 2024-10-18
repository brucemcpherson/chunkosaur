# gas doesnt support generators
regenerator --include-runtime ../src/chunker.mjs | sed "s/export var/var/g" > ./src/chunker.js
cat ../src/bulker.mjs | sed "s/export class/class/g" > ./src/bulker.js