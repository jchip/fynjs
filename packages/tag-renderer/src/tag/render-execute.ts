import type { RenderContext } from "../runtime/index.js";
import type { RenderStep } from "./render-processor.js";
import { executeSteps } from "./render-processor.js";
import type { TagTemplate } from "./tag-template.js";
import { isTemplateTags } from "./tag-template.js";

const addDebugStart = (context: RenderContext, step: RenderStep): void => {
  const token = step.token;
  if (!token) return;
  context.output.add(`<!-- BEGIN ${String(token.id)} props: ${JSON.stringify(token.props)} -->\n`);
};

const addDebugEnd = (context: RenderContext, step: RenderStep): void => {
  if (step.token) context.output.add(`<!-- ${String(step.token.id)} END -->\n`);
};

const handleResult = async (
  template: TagTemplate,
  context: RenderContext,
  tokenId: string | number,
  result: unknown,
): Promise<void> => {
  const resolved = await result;
  if (isTemplateTags(resolved) || Array.isArray(resolved)) {
    const subTemplate = await template.handleSubTemplate(resolved);
    await executeTagTemplate(subTemplate, context, true);
    return;
  }
  await context.handleTokenResult(tokenId, resolved);
};

const executeStep = async (
  template: TagTemplate,
  context: RenderContext,
  step: RenderStep,
): Promise<void> => {
  switch (step.code) {
    case executeSteps.STEP_SUB_TEMPLATE:
      if (step.template) await executeTagTemplate(step.template, context, true);
      return;
    case executeSteps.STEP_FUNC_HANDLER:
      if (step.handler) await handleResult(template, context, "", step.handler(context));
      return;
    case executeSteps.STEP_HANDLER: {
      if (!step.token) return;
      if (step.insertTokenId) addDebugStart(context, step);
      if (step.handler) {
        await handleResult(
          template,
          context,
          String(step.token.id),
          step.handler(context, step.token),
        );
      }
      if (step.insertTokenId) addDebugEnd(context, step);
      return;
    }
    case executeSteps.STEP_STR_TOKEN:
      if (typeof step.data === "string") context.output.add(step.data);
      return;
    case executeSteps.STEP_LITERAL_HANDLER:
      if (step.insertTokenId) addDebugStart(context, step);
      await context.handleTokenResult("", step.data);
      if (step.insertTokenId) addDebugEnd(context, step);
      return;
    case executeSteps.STEP_NO_HANDLER:
      if (step.token) context.output.add(`<!-- unhandled token ${String(step.token.id)} -->\n`);
      return;
  }
};

export async function executeTagTemplate(
  template: TagTemplate,
  context: RenderContext,
  subTemplate = false,
): Promise<unknown> {
  for (let index = 0; index < template._templateTags.length; index++) {
    if (context.isFullStop || context.isVoidStop) break;
    const step = await template.getTagOpCode(index);
    if (step) await executeStep(template, context, step);
  }

  return subTemplate ? undefined : context.output.close();
}
