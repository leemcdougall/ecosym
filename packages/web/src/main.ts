import { VERSION } from "@ecosym/engine";

const counts = document.querySelector<HTMLDivElement>("#counts")!;
counts.textContent = `Coming soon (engine ${VERSION})`;
