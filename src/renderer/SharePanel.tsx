import { useEffect, useState } from 'react';
import { Input, Modal } from '@heroui/react';
import { ChoiceSelect } from './ChoiceSelect';
import { Copy, Hand, Share2, Users } from 'lucide-react';
import type { ShareState } from '../shared/share';
import { ActionButton } from './ui';

export function SharePanel({
  state,
  ready,
  onAction,
}: {
  state?: ShareState;
  ready: boolean;
  onAction: <T = unknown>(action: string, payload?: unknown) => Promise<T>;
}) {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<Array<{ address: string; label: string }>>([]);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('主持人');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open && !state?.active)
      void onAction<typeof addresses>('share:addresses').then((list) => {
        if (list) {
          setAddresses(list);
          setAddress(list[0]?.address || '');
        }
      });
  }, [open, state?.active, onAction]);
  const run = async (action: string, payload?: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction(action, payload);
    } finally {
      setBusy(false);
    }
  };
  const pending = state?.participants.filter((p) => p.status === 'pending').length || 0;
  return (
    <>
      <ActionButton
        className={`share-button ${state?.active ? 'is-on' : ''}`}
        aria-label="共享页面"
        onPress={() => setOpen(true)}
        isDisabled={!ready}
      >
        {state?.active ? <Users size={14} /> : <Share2 size={14} />}
        {pending
          ? `${pending} 人等待加入`
          : state?.active
            ? `共享中 · ${state.participants.length} 人`
            : '共享'}
      </ActionButton>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="share-dialog">
            <Modal.CloseTrigger aria-label="关闭共享设置" />
            <Modal.Header>
              <Modal.Heading>{state?.active ? '共享此页面' : '邀请他人一起操作'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {!state?.active ? (
                <div className="share-start-form">
                  <p>
                    受邀者可以查看此页面；经你允许后，也可以浏览当前站点和修改页面。共享期间自动记录双方的操作。
                  </p>
                  <label htmlFor="share-host-name">你的称呼</label>
                  <Input
                    id="share-host-name"
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <label htmlFor="share-network">连接网络</label>
                  <ChoiceSelect
                    id="share-network"
                    label="连接网络"
                    value={address}
                    onChange={setAddress}
                    options={addresses.map((a) => ({
                      value: a.address,
                      label: `${a.label} · ${a.address}`,
                    }))}
                  />
                  <p className="muted">
                    双方需处于可互通的局域网或
                    VPN。首次打开链接时，请核对本次共享的证书指纹，再继续连接。
                  </p>
                  <ActionButton
                    className="primary-button"
                    isPending={busy}
                    isDisabled={!name.trim() || !address}
                    onPress={() => void run('share:start', { address, name })}
                  >
                    开始共享并生成邀请
                  </ActionButton>
                </div>
              ) : (
                <div className="share-active-content">
                  <p className="share-page-title" title={state.title}>
                    {state.title || '当前页面'}
                  </p>
                  <div className="share-invitation">
                    {state.invite ? (
                      <>
                        <label htmlFor="share-link">
                          邀请链接 ·{' '}
                          {new Date(state.invite.expiresAt).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          到期
                        </label>
                        <div className="share-link-row">
                          <Input
                            id="share-link"
                            readOnly
                            value={state.invite.url}
                            onFocus={(e) => e.target.select()}
                          />
                          <ActionButton
                            className="primary-button"
                            aria-label="复制邀请链接"
                            onPress={async () => {
                              await onAction('app:copy', { text: state.invite!.url });
                              setCopied(true);
                            }}
                          >
                            <Copy size={15} />
                            {copied ? '已复制' : '复制'}
                          </ActionButton>
                        </div>
                        <ActionButton
                          isDisabled={busy}
                          onPress={() => void run('share:revoke-invite')}
                        >
                          撤销邀请
                        </ActionButton>
                      </>
                    ) : (
                      <p>邀请已撤销或到期，已加入的人仍可继续协作。</p>
                    )}
                    <ActionButton
                      isDisabled={busy}
                      onPress={() => {
                        setCopied(false);
                        void run('share:invite');
                      }}
                    >
                      生成新邀请
                    </ActionButton>
                  </div>
                  <details className="share-certificate">
                    <summary>连接与证书</summary>
                    <p>{state.address}</p>
                    <p>证书 SHA-256 指纹</p>
                    <code>{state.fingerprint}</code>
                    <p>请通过你信任的渠道告知受邀者指纹。共享结束后，本次证书和链接失效。</p>
                  </details>
                  <div className="share-section-heading">
                    <h3>参与者</h3>
                    <span>{state.participants.length} 人</span>
                  </div>
                  <p className="share-permission-note">操作权限与当前控制权分别管理。</p>
                  <ul className="share-participants">
                    {state.participants.map((p) => (
                      <li key={p.id} data-controller={state.controllerId === p.id}>
                        <div className="share-member-identity">
                          <span className="share-participant-avatar" aria-hidden="true">
                            {p.name.slice(0, 1)}
                          </span>
                          <div>
                            <strong>
                              {p.name}
                              {p.id === 'host' ? '（你）' : ''}
                            </strong>
                            <span>
                              {p.role === 'host' ? '主持人' : `身份 ${p.id.slice(0, 8)}`} ·{' '}
                              {p.status === 'pending'
                                ? '等待确认'
                                : p.status === 'connected'
                                  ? '已连接'
                                  : '已断开'}
                              {state.controllerId === p.id ? ' · 正在操作' : ''}
                            </span>
                            {p.requestedControl && (
                              <span className="share-request">
                                <Hand size={13} />
                                请求操作页面
                              </span>
                            )}
                          </div>
                        </div>
                        {p.role !== 'host' && (
                          <div className="share-member-actions">
                            <ChoiceSelect
                              label={`${p.name}的权限`}
                              value={p.status === 'pending' ? 'pending' : p.role}
                              isDisabled={busy}
                              onChange={(value) =>
                                void run('share:approve', { id: p.id, role: value })
                              }
                              options={[
                                ...(p.status === 'pending'
                                  ? [{ value: 'pending', label: '确认加入…', disabled: true }]
                                  : []),
                                { value: 'viewer', label: '仅查看' },
                                { value: 'editor', label: '可操作' },
                              ]}
                            />
                            {p.role === 'editor' &&
                              p.status === 'connected' &&
                              state.controllerId !== p.id && (
                                <ActionButton
                                  isDisabled={busy || state.changingControl}
                                  onPress={() => void run('share:control', { id: p.id })}
                                >
                                  交给 {p.name} 操作
                                </ActionButton>
                              )}
                            <ActionButton
                              isDisabled={busy}
                              onPress={() => void run('share:remove', { id: p.id })}
                            >
                              {p.status === 'pending' ? '拒绝' : '移除'}
                            </ActionButton>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {state.controllerId !== 'host' && (
                    <ActionButton
                      className="primary-button"
                      isDisabled={busy || state.changingControl}
                      onPress={() => void run('share:control', { id: 'host' })}
                    >
                      收回控制权
                    </ActionButton>
                  )}
                  {state.error && <p role="alert">{state.error}</p>}
                  <ActionButton
                    className="secondary-button"
                    isDisabled={busy}
                    onPress={() => void run('share:stop')}
                  >
                    停止共享并保存记录
                  </ActionButton>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
