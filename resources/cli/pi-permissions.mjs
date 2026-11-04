// Loaded explicitly by Athena; no dependency on the app's node_modules.
export default function athenaPermissions(pi) {
  pi.on('session_start', async (_event, ctx) => {
    if (ctx.mode !== 'rpc') throw new Error('Athena requires Pi RPC mode');
    ctx.ui.notify('athena-permissions-v1', 'info');
  });
  pi.on('tool_call', async (event, ctx) => {
    // Every native operation is user-approved, including reads outside the workspace.
    // No pattern-based dangerous-command heuristic and no persistent "always allow".
    if (ctx.mode !== 'rpc' || !ctx.hasUI || ctx.signal?.aborted)
      return { block: true, reason: 'Athena authorization is unavailable' };
    const detail = JSON.stringify(event.input);
    if (typeof detail !== 'string' || detail.length > 16000)
      return { block: true, reason: 'Tool arguments exceed the reviewable approval limit' };
    const approved = await ctx.ui.confirm(`Pi · ${event.toolName}`, detail, { signal: ctx.signal });
    if (!approved || ctx.signal?.aborted)
      return { block: true, reason: 'This operation was not approved in Athena' };
  });
}
