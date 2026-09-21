import type { PLMPackProjectExchange } from '../illustrator/projectExchange';
import { generateCorelAutomationScript } from './corelGenerator';
import { getBridgeSessionToken, setBridgeSessionToken } from '../illustrator/IllustratorBridgeClient';

export interface CorelBridgeStatus {
  bridgeOnline: boolean;
  authenticated?: boolean;
  corelDetected: boolean;
  corelVersion?: string;
  activeDocument?: string;
}

export type CorelBridgeEventHandler = (event: {
  type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR';
  data?: any;
}) => void;

export class CorelDrawBridgeClient {
  private static instance: CorelDrawBridgeClient;
  private bridgeUrls = ['http://127.0.0.1:48123', 'http://localhost:48123'];
  private currentBridgeUrl = 'http://127.0.0.1:48123';
  private listeners: Set<CorelBridgeEventHandler> = new Set();
  private status: CorelBridgeStatus = { bridgeOnline: false, authenticated: false, corelDetected: false };
  private lastArtworkUri: string | null = null;

  private constructor() {
    this.checkStatus();
    setInterval(() => this.checkStatus(), 2000);
  }

  public static getInstance(): CorelDrawBridgeClient {
    if (!CorelDrawBridgeClient.instance) {
      CorelDrawBridgeClient.instance = new CorelDrawBridgeClient();
    }
    return CorelDrawBridgeClient.instance;
  }

  public addListener(handler: CorelBridgeEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notify(type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR', data?: any) {
    for (const handler of this.listeners) {
      try {
        handler({ type, data });
      } catch (err) {
        console.error('Erro no listener da bridge CorelDRAW:', err);
      }
    }
  }

  public getStatus(): CorelBridgeStatus {
    return { ...this.status };
  }

  public isPaired(): boolean {
    return !!getBridgeSessionToken() && !!this.status.authenticated;
  }

  public getLastArtworkUri(): string | null {
    return this.lastArtworkUri;
  }

  /**
   * Realiza o pareamento manual enviando o código OTP de 6 dígitos gerado pela bridge
   */
  public async pairWithOtp(pairingCode: string): Promise<{ success: boolean; message: string }> {
    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${url}/api/auth/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairingCode }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (res.ok && data.token) {
          setBridgeSessionToken(data.token);
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.status.authenticated = true;
          this.notify('STATUS_CHANGED', this.status);
          await this.checkStatus();
          return { success: true, message: 'Pareamento realizado com sucesso!' };
        } else {
          return { success: false, message: data.message || 'Código de pareamento incorreto ou expirado.' };
        }
      } catch {}
    }
    return { success: false, message: 'Não foi possível conectar à bridge local na porta 48123.' };
  }

  /**
   * Revoga a sessão ativa na bridge
   */
  public async revokeSession(): Promise<void> {
    const token = getBridgeSessionToken();
    if (!token) return;
    try {
      await fetch(`${this.currentBridgeUrl}/api/auth/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch {}
    setBridgeSessionToken(null);
    this.status.authenticated = false;
    this.notify('STATUS_CHANGED', this.status);
  }

  public async checkStatus(): Promise<CorelBridgeStatus> {
    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(`${url}/api/status`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;

          const token = getBridgeSessionToken();
          if (token) {
            try {
              const authCtrl = new AbortController();
              const authTimeout = setTimeout(() => authCtrl.abort(), 2000);
              const authRes = await fetch(`${url}/api/session-info`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                signal: authCtrl.signal,
              });
              clearTimeout(authTimeout);

              if (authRes.ok) {
                const info = await authRes.json();
                this.status.authenticated = true;
                this.status.corelDetected = !!info.corelDetected;
                this.notify('STATUS_CHANGED', this.status);
                return this.status;
              } else if (authRes.status === 401) {
                setBridgeSessionToken(null);
                this.status.authenticated = false;
                this.status.corelDetected = false;
                this.notify('STATUS_CHANGED', this.status);
                return this.status;
              }
            } catch {}
          } else {
            this.status.authenticated = false;
            this.status.corelDetected = false;
          }

          this.notify('STATUS_CHANGED', this.status);
          return this.status;
        }
      } catch {}
    }

    if (this.status.bridgeOnline) {
      this.status.bridgeOnline = false;
      this.status.authenticated = false;
      this.notify('STATUS_CHANGED', this.status);
    }
    return this.status;
  }

  /**
   * Envia o projeto para abertura imediata no CorelDRAW
   */
  public async openInCorelDraw(project: PLMPackProjectExchange): Promise<{ success: boolean; message: string; isFallback?: boolean; requiresAuth?: boolean }> {
    const token = getBridgeSessionToken();
    if (!token) {
      return {
        success: false,
        message: 'Pareamento pendente. Digite o código OTP no cabeçalho para conectar ao CorelDRAW.',
        requiresAuth: true,
      };
    }

    const payload = { ...project, targetApp: 'coreldraw' };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${this.currentBridgeUrl}/api/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        setBridgeSessionToken(null);
        this.status.authenticated = false;
        this.notify('STATUS_CHANGED', this.status);
        return {
          success: false,
          message: 'Sessão expirada. Digite o novo código de pareamento da bridge.',
          requiresAuth: true,
        };
      }

      if (res.ok) {
        const result = await res.json();
        return {
          success: true,
          message: result.message || 'Faca aberta com sucesso no CorelDRAW!',
        };
      } else {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: errData.message || 'Falha ao processar abertura no CorelDRAW.',
        };
      }
    } catch {
      return {
        success: false,
        message: 'A bridge não respondeu no tempo limite.',
        isFallback: true,
      };
    }
  }

  /**
   * Faz o download direto do script de automação .ps1 compilado para o CorelDRAW
   */
  public downloadCorelScript(project: PLMPackProjectExchange): void {
    try {
      const scriptCode = generateCorelAutomationScript(project);
      const blob = new Blob([scriptCode], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.modelCode}_${project.parameters.L || 300}x${project.parameters.B || 200}x${project.parameters.H || 150}_CorelDRAW.ps1`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Erro ao baixar script do CorelDRAW:', e);
    }
  }

  /**
   * Solicita ao CorelDRAW que capture a camada de arte e devolva para o PLMPackLib 3D
   */
  public async requestArtworkSync(projectId: string): Promise<{ success: boolean; message: string; textureDataUri?: string; requiresAuth?: boolean }> {
    const token = getBridgeSessionToken();
    if (!token) {
      return { success: false, message: 'Pareamento pendente. Digite o código OTP.', requiresAuth: true };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${this.currentBridgeUrl}/api/sync-artwork`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId, targetApp: 'coreldraw' }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        setBridgeSessionToken(null);
        this.status.authenticated = false;
        this.notify('STATUS_CHANGED', this.status);
        return { success: false, message: 'Sessão expirada. Faça o pareamento novamente.', requiresAuth: true };
      }

      if (res.ok) {
        const data = await res.json();
        if (data.textureDataUri) {
          this.lastArtworkUri = data.textureDataUri;
          this.notify('ARTWORK_UPDATED', { textureDataUri: data.textureDataUri });
        }
        return {
          success: true,
          message: 'Arte sincronizada com sucesso do CorelDRAW!',
          textureDataUri: data.textureDataUri,
        };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.message || 'CorelDRAW não respondeu ao pedido de captura da arte.' };
      }
    } catch {
      return { success: false, message: 'Erro de comunicação ao sincronizar arte do CorelDRAW.' };
    }
  }
}
