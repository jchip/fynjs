import type { RenderContext } from "../runtime/index.js";
import type { RenderStep } from "./render-processor.js";
import type { TagTemplate } from "./tag-template.js";
import { isTemplateTags } from "./tag-template.js";

export const executeSteps = {
  STEP_HANDLER: 0,
  STEP_STR_TOKEN: 1,
  STEP_NO_HANDLER: 2,
  STEP_LITERAL_HANDLER: 3,
  STEP_FUNC_HANDLER: 4,
  STEP_SUB_TEMPLATE: 5,
} as const;

type StepResult = void | PromiseLike<void>;

const isPromiseLike = <Value>(value: unknown): value is PromiseLike<Value> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as PromiseLike<Value>).then === "function";

const addDebugStart = (context: RenderContext, step: RenderStep): void => {
  const token = step.token;
  if (!token) return;
  context.output.add(`<!-- BEGIN ${String(token.id)} props: ${JSON.stringify(token.props)} -->\n`);
};

const addDebugEnd = (context: RenderContext, step: RenderStep): void => {
  if (step.token) context.output.add(`<!-- ${String(step.token.id)} END -->\n`);
};

const handleResolvedResult = (
  template: TagTemplate,
  context: RenderContext,
  tokenId: string | number,
  resolved: unknown,
): StepResult => {
  if (isTemplateTags(resolved) || Array.isArray(resolved)) {
    return template
      .handleSubTemplate(resolved)
      .then((subTemplate) => executeTemplateSteps(subTemplate, context));
  }
  void tokenId;
  context.handleResolvedTokenResult(resolved, tokenId);
};

const handleResult = (
  template: TagTemplate,
  context: RenderContext,
  tokenId: string | number,
  result: unknown,
): StepResult =>
  isPromiseLike(result)
    ? Promise.resolve(result).then((resolved) =>
        handleResolvedResult(template, context, tokenId, resolved),
      )
    : handleResolvedResult(template, context, tokenId, result);

const finishDebug = (context: RenderContext, step: RenderStep, pending: StepResult): StepResult => {
  if (isPromiseLike(pending)) {
    return Promise.resolve(pending).then(() => addDebugEnd(context, step));
  }
  addDebugEnd(context, step);
};

const executeStep = (
  template: TagTemplate,
  context: RenderContext,
  step: RenderStep,
): StepResult => {
  switch (step.code) {
    case executeSteps.STEP_SUB_TEMPLATE:
      if (step.template) return executeTemplateSteps(step.template, context);
      return;
    case executeSteps.STEP_FUNC_HANDLER:
      if (step.handler) {
        return handleResult(
          template,
          context,
          "",
          context._invokeHandler(() => step.handler!(context)),
        );
      }
      return;
    case executeSteps.STEP_HANDLER: {
      if (!step.token) return;
      if (step.insertTokenId) addDebugStart(context, step);
      if (step.handler) {
        const pending = handleResult(
          template,
          context,
          String(step.token.id),
          context._invokeHandler(() => step.handler!(context, step.token)),
        );
        if (step.insertTokenId) return finishDebug(context, step, pending);
        return pending;
      }
      if (step.insertTokenId) addDebugEnd(context, step);
      return;
    }
    case executeSteps.STEP_STR_TOKEN:
      if (typeof step.data === "string") context.output.add(step.data);
      return;
    case executeSteps.STEP_LITERAL_HANDLER:
      if (step.insertTokenId) addDebugStart(context, step);
      context.handleResolvedTokenResult(step.data);
      if (step.insertTokenId) addDebugEnd(context, step);
      return;
    case executeSteps.STEP_NO_HANDLER:
      if (step.token) context.output.add(`<!-- unhandled token ${String(step.token.id)} -->\n`);
      return;
  }
};

const executeTemplateSteps = (template: TagTemplate, context: RenderContext): StepResult => {
  let index = 0;

  const advance = (): StepResult => {
    while (index < template._steps.length) {
      if (context.isFullStop || context.isVoidStop) return;
      const pending = executeStep(template, context, template._steps[index++]);
      if (isPromiseLike(pending)) {
        if (context.output.acceptsStreams) context.output.flush();
        return context._awaitSuspension(pending).then(advance);
      }
    }
  };

  return advance();
};

export function executeTagTemplate(
  template: TagTemplate,
  context: RenderContext,
  subTemplate = false,
): Promise<unknown> {
  const pending = executeTemplateSteps(template, context);
  const finish = (): unknown => {
    if (subTemplate) return;
    const deferred = context.closeDeferred();
    const output = context.output.close();
    return Promise.all([deferred, output]).then(([, result]) => result);
  };

  return isPromiseLike(pending) ? Promise.resolve(pending).then(finish) : Promise.resolve(finish());
}
