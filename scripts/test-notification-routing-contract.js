const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const mobileRoutingPath = path.join(repoRoot, 'src', 'utils', 'mobileRouting.ts');
const notificationRoutingPath = path.join(repoRoot, 'src', 'utils', 'notificationRouting.ts');

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function loadMobileRouting() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    URL,
    URLSearchParams,
  };

  vm.runInNewContext(compile(mobileRoutingPath), sandbox, { filename: mobileRoutingPath });
  return module.exports;
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  const {
    buildMessageNotificationRoute,
    getMessageNotificationTarget,
    normalizeNotificationContext,
    parseMessageTargetUrl,
    routeForNotification,
  } = loadMobileRouting();

  assert.deepEqual(
    toJson(getMessageNotificationTarget({ type: 'message', threadId: 'thread-1', messageId: 'message-1' })),
    {
      type: 'thread',
      params: {
        threadId: 'thread-1',
        conversationId: 'thread-1',
        messageId: 'message-1',
        orderId: null,
        customOrderId: null,
        brandId: null,
        customerId: null,
        actorUserId: null,
        targetUrl: null,
        designId: null,
        productId: null,
        _hasUnsupportedContext: false,
      },
    },
  );

  assert.equal(
    getMessageNotificationTarget({ notificationType: 'MESSAGE_RECEIVED', conversationId: 'conversation-1' }).params.conversationId,
    'conversation-1',
  );
  assert.equal(
    getMessageNotificationTarget({ type: 'message', messageId: 'message-1' }).params.messageId,
    'message-1',
  );
  assert.equal(
    getMessageNotificationTarget({ type: 'message', orderId: 'order-1' }).params.orderId,
    'order-1',
  );
  assert.equal(
    getMessageNotificationTarget({ type: 'message', customOrderId: 'custom-order-1' }).params.customOrderId,
    'custom-order-1',
  );

  assert.deepEqual(
    toJson(parseMessageTargetUrl('/studio/messages?thread=thread-123&messageId=message-456')),
    {
      threadId: 'thread-123',
      conversationId: 'thread-123',
      messageId: 'message-456',
      orderId: null,
      customOrderId: null,
      brandId: null,
      customerId: null,
      targetUrl: '/studio/messages?thread=thread-123&messageId=message-456',
    },
  );

  assert.deepEqual(
    toJson(parseMessageTargetUrl('/studio?tab=orders&orderId=order-123&openChat=1')),
    {
      threadId: null,
      conversationId: null,
      messageId: null,
      orderId: 'order-123',
      customOrderId: null,
      brandId: null,
      customerId: null,
      targetUrl: '/studio?tab=orders&orderId=order-123&openChat=1',
    },
  );

  assert.equal(
    getMessageNotificationTarget({
      notificationType: 'MESSAGE_RECEIVED',
      targetUrl: '/messages?thread=thread-123&messageId=message-456',
    }).params.threadId,
    'thread-123',
  );
  assert.equal(
    getMessageNotificationTarget({
      notificationType: 'MESSAGE_RECEIVED',
      targetUrl: '/studio?tab=orders&orderId=order-123&openChat=1',
    }).params.orderId,
    'order-123',
  );

  assert.equal(getMessageNotificationTarget({ type: 'message' }).type, 'inbox');
  assert.equal(getMessageNotificationTarget({ type: 'message', designId: 'design-1' }).type, 'unsupported');
  assert.equal(getMessageNotificationTarget({ type: 'message', productId: 'product-1' }).type, 'unsupported');
  assert.equal(getMessageNotificationTarget({ type: 'message', threadId: 'thread-1', designId: 'design-1' }).type, 'thread');

  assert.deepEqual(
    toJson(buildMessageNotificationRoute(getMessageNotificationTarget({ type: 'message', messageId: 'message-1' }))),
    {
      pathname: '/messages/[threadId]',
      params: {
        threadId: 'resolve',
        messageId: 'message-1',
      },
    },
  );

  assert.deepEqual(
    toJson(routeForNotification({
      type: 'MESSAGE_RECEIVED',
      payload: {
        type: 'message',
        threadId: 'thread-1',
        messageId: 'message-1',
      },
      targetUrl: null,
      target: null,
      actor: null,
      subTargetId: null,
    })),
    {
      pathname: '/messages/[threadId]',
      params: {
        threadId: 'thread-1',
        conversationId: 'thread-1',
        messageId: 'message-1',
      },
    },
  );

  assert.equal(
    normalizeNotificationContext({
      type: 'message',
      actorUserId: 'actor-1',
      targetUrl: '/studio/messages?thread=thread-1',
    }).actorUserId,
    'actor-1',
  );

  const notificationRoutingSource = fs.readFileSync(notificationRoutingPath, 'utf8');
  assert.match(notificationRoutingSource, /pendingNavigationRef\.current = \{ params: context, type: options\.type \}/);
  assert.match(notificationRoutingSource, /pendingNavigationRef\.current = null;\s*navigateToMessage/s);
  assert.match(notificationRoutingSource, /getMessageNotificationTarget\(\{ targetUrl: url \}\)/);

  console.log('Notification routing contract tests passed.');
}

main();
