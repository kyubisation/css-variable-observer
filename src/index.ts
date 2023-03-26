import { CssVariableObserver } from "./css-variable-observer.js";

// Write TypeScript code!
const appDiv: HTMLElement = document.getElementById("app")!;
appDiv.innerHTML = `<h1>TypeScript Starter</h1>`;

const observer = new CssVariableObserver((c) => console.log(c));
observer.observe(appDiv, { variables: ["--var1", "--var2"] });
