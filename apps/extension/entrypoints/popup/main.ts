import { PROTOCOL, PROTOCOL_VERSION } from "@fluid-deck/extension-core";

const status = document.getElementById("status");
if (status) status.textContent = `Ready — ${PROTOCOL} v${PROTOCOL_VERSION}`;
