import type { PLMPackProjectExchange } from './projectExchange';
import { generateIllustratorJsx } from './jsxGenerator';

export interface BridgeStatus {
  bridgeOnline: boolean;
  illustratorDetected: boolean;
  activeDocument?: string;
  cepExtensionActive?: boolean;
}

export type BridgeEventHandler = (event: {
  type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR';
  data?: any;
}) => void;

export class IllustratorBridgeClient {
  private static instance: IllustratorBridgeClient;
  private bridgeUrls = ['http://127.0.0.1:48123', 'http://localhost:48123'];
  private currentBridgeUrl = 'http://127.0.0.1:48123';
  private ws: WebSocket | null = null;
  private listeners: Set<BridgeEventHandler> = new Set();
  private status: BridgeStatus = { bridgeOnline: false, illustratorDetected: false };
  private reconnectTimer: any = null;

  private lastArtworkUri: string | null = null;

  private constructor() {
    this.initWebSocket();
    this.checkStatus();
    setInterval(() => this.checkStatus(), 2500);
  }

  public static getInstance(): IllustratorBridgeClient {
    if (!IllustratorBridgeClient.instance) {
      IllustratorBridgeClient.instance = new IllustratorBridgeClient();
    }
    return IllustratorBridgeClient.instance;
  }

  public addListener(handler: BridgeEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notify(type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR', data?: any) {
    for (const handler of this.listeners) {
      try {
        handler({ type, data });
      } catch (err) {
        console.error('Erro no listener da bridge Illustrator:', err);
      }
    }
  }

  private initWebSocket() {
    // Em páginas HTTPS, conexões ws:// inseguras para localhost podem ser bloqueadas pelo browser
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      // Deixamos a comunicação acontecer via HTTP fetch polling resiliente
      return;
    }

    try {
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }

      this.ws = new WebSocket('ws://127.0.0.1:48123/ws');

      this.ws.onopen = () => {
        this.status.bridgeOnline = true;
        this.notify('STATUS_CHANGED', this.status);
        this.checkStatus();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ARTWORK_UPDATED') {
            this.lastArtworkUri = msg.payload?.textureDataUri || msg.payload;
            this.notify('ARTWORK_UPDATED', msg.payload);
          } else if (msg.type === 'STATUS_UPDATE') {
            this.status = { ...this.status, ...msg.payload };
            this.notify('STATUS_CHANGED', this.status);
          }
        } catch (e) {
          console.error('Falha ao processar mensagem da Bridge:', e);
        }
      };

      this.ws.onclose = () => {
        this.status.bridgeOnline = false;
        this.notify('STATUS_CHANGED', this.status);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.status.bridgeOnline = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initWebSocket();
    }, 5000);
  }

  public async checkStatus(): Promise<BridgeStatus> {
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
          const data = await res.json();
          this.currentBridgeUrl = url;
          const wasOnline = this.status.bridgeOnline;
          this.status = { bridgeOnline: true, ...data };
          if (!wasOnline) {
            this.notify('STATUS_CHANGED', this.status);
          }
          if (data.latestArtworkDataUri && data.latestArtworkDataUri !== this.lastArtworkUri) {
            this.lastArtworkUri = data.latestArtworkDataUri;
            this.notify('ARTWORK_UPDATED', { textureDataUri: data.latestArtworkDataUri });
          }
          return this.status;
        }
      } catch {}
    }

    if (this.status.bridgeOnline) {
      this.status.bridgeOnline = false;
      this.notify('STATUS_CHANGED', this.status);
    }
    return this.status;
  }

  /**
   * Envia o projeto para abertura imediata no Adobe Illustrator 2025
   */
  public async openInIllustrator(project: PLMPackProjectExchange): Promise<{ success: boolean; message: string; isFallback?: boolean }> {
    // Garante que o pacote contenha o código ExtendScript vetorial 1:1 pronto para execução
    const jsxCode = (project as any).jsx || generateIllustratorJsx(project);
    const payload = { ...project, jsx: jsxCode };

    // Tenta envio direto para a Bridge / Painel CEP Local
    const urlsToTry = [this.currentBridgeUrl, ...this.bridgeUrls.filter(u => u !== this.currentBridgeUrl)];

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        const res = await fetch(`${url}/api/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const result = await res.json();
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.notify('STATUS_CHANGED', this.status);

          return {
            success: true,
            message: result.message || 'Projeto aberto com sucesso no Adobe Illustrator!',
          };
        }
      } catch (e) {
        // Tenta próxima URL
      }
    }

    this.status.bridgeOnline = false;
    this.notify('STATUS_CHANGED', this.status);

    return {
      success: false,
      message: 'Extensão local do Illustrator offline.',
      isFallback: true,
    };
  }

  /**
   * Faz o download direto do arquivo de script .jsx compilado para o Illustrator
   */
  public downloadJsxFile(project: PLMPackProjectExchange): void {
    try {
      const jsxCode = generateIllustratorJsx(project);
      const blob = new Blob([jsxCode], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.modelCode}_${project.parameters.L || 300}x${project.parameters.B || 200}x${project.parameters.H || 150}_1a1.jsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Erro ao baixar arquivo .jsx:', e);
    }
  }

  /**
   * Solicita ao Illustrator que capture a camada de arte e devolva para o PLMPackLib 3D
   */
  public async requestArtworkSync(projectId: string): Promise<{ success: boolean; message: string; textureDataUri?: string }> {
    try {
      const res = await fetch(`${this.currentBridgeUrl}/api/sync-artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.textureDataUri) {
          this.notify('ARTWORK_UPDATED', { textureDataUri: data.textureDataUri });
        }
        return {
          success: true,
          message: 'Arte sincronizada com sucesso do Adobe Illustrator!',
          textureDataUri: data.textureDataUri,
        };
      }
      return { success: false, message: 'Illustrator não respondeu ao pedido de captura da arte.' };
    } catch (e) {
      return { success: false, message: 'Serviço de ponte local indisponível no momento.' };
    }
  }
}
