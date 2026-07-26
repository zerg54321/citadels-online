# Vite 开发服务器 ECONNRESET 崩溃排查报告

## 现象

局域网测试中，Vite 开发服务器（client-react）频繁挂掉，`scripts\dev-status.cmd` 显示：

```
client-react port 3010 not listening
```

而 server（port 8081）仍在正常运行。

## 日志证据

`.dev-logs\client-react.err.log` 末尾：

```
node:events:486
      throw er; // Unhandled 'error' event
      ^

Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
Emitted 'error' event on Socket instance at:
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:89:21) {
  errno: -4077,
  code: 'ECONNRESET',
  syscall: 'read'
}
```

`.dev-logs\client-react.out.log` 启动时正常：

```
VITE v6.4.3  ready in 431 ms
  ➜  Local:   http://localhost:3010/
  ➜  Network: http://192.168.31.8:3010/
  ...
```

## 技术分析

### 直接原因

Vite 6.4.3 + Node.js v24.11.1（Windows）上，当局域网客户端（浏览器）通过 WebSocket（HMR）连接后突然断开（刷新页面、关闭标签页、WiFi 波动），底层 TCP socket 触发 `ECONNRESET`（远程连接重置）。该 socket 的 `error` 事件未被 Vite 内部正确消费，导致 Node.js 抛出 unhandled `'error'` event → 进程崩溃。

### 触发条件

- 局域网多设备访问（网络稳定性低于 localhost）
- HMR WebSocket 是主要通道，Vite 对其 socket error 处理不完善
- `ECONNRESET` 在 Windows 上对应 `WSAECONNRESET (10054)`，在 Node.js 上映射为 `errno -4077`

### 责任归属

- **Vite**：WS socket 的 `error` event listener 仅做 `logger.error + socket.end()`，但未阻止事件继续传播到 `http-proxy` 层，在特定路径下成为 unhandled error
- **Node.js**：v24 系列在 http client 层存在未绑定 `req.on('error')` 时 destroy() 导致未捕获 `ECONNRESET` 的回归（[#64272](https://github.com/nodejs/node/issues/64272)，已在 v24.18.1+ 修复）

## 修复方案（推荐）

### 方案 A：uncaughtException 兜底（最小侵入，立即生效）

在 `client-react/vite.config.ts` 顶部添加：

```ts
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
  console.error('Uncaught:', err);
});
```

效果：拦截所有未捕获异常中 code 为 `ECONNRESET` 的，静默忽略；其他异常仍正常打印。

### 方案 B：升级 Vite / Node.js

- 升级 Node.js 到 v24.18.1+（修复 [#64272](https://github.com/nodejs/node/issues/64272) 回归）
- 升级 Vite 到最新版检查上游是否已修复 WS socket error 处理

### 方案 C：组合

先实施方案 A 保证稳定性，同时择机升级运行时环境。
