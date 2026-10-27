// One Pi extension, with independently maintained feature modules.
import claudeCommands from "./modules/claude-commands.js";
import effortPicker from "./modules/effort-picker.js";
import hideTools from "./modules/hide-tools.js";
import statusline from "./modules/statusline.js";
import workingAnimation from "./modules/working-animation.js";

export default function myPiExtension(pi) {
  claudeCommands(pi);
  effortPicker(pi);
  hideTools(pi);
  statusline(pi);
  workingAnimation(pi);
}
