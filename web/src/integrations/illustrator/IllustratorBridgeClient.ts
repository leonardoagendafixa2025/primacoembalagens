import type { IllustratorProjectPayload } from './projectExchange';
import { BRIDGE_ERROR_CODES, validateIllustratorPayload } from './projectExchange';
import { generateIllustratorJsx } from './jsxGenerator';

export type BridgeConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'SENDING'
  | 'RECEIVED'
  | 'SYNCHRONIZED'
  | 'CONNECTION_ERROR'
  | 'VERSION_CONFLICT'
  | 'ILLUSTRATOR_NOT_FOUND'
  | 'PLUGIN_NOT_CONNECTED';

export interface BridgeStatus {
  bridgeOnline: boolean;
  authenticated?: boolean;
  illustratorDetected: boolean;
  activeDocument?: string;
  cepExtensionActive?: boolean;
  state?: BridgeConnectionState;
  stateLabel?: string;
  activeProjectId?: string | null;
  activeSessionId?: string | null;
  activeRevision?: number;
  lastError?: {
    code: string;
    message: string;
    timestamp: string;
  } | null;
}

export type BridgeEventHandler = (event: {
  type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR' | 'REVISION_CONFLICT';
  data?: any;
}) => void;

let inMemorySessionToken: string | null = 'auto_auth_token';

export function getBridgeSessionToken(): string | null {
  return inMemorySessionToken;
}

export function setBridgeSessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

export class IllustratorBridgeClient {
  private static instance: IllustratorBridgeClient;
  private bridgeUrls = ['http://127.0.0.1:48123', 'http://localhost:48123'];
  public currentBridgeUrl = 'http://127.0.0.1:48123';
  private listeners: Set<BridgeEventHandler> = new Set();
  private status: BridgeStatus = {
    bridgeOnline: false,
    authenticated: true,
    illustratorDetected: false,
    state: 'DISCONNECTED',
    stateLabel: 'Desconectado',
    lastError: null,
  };

  private currentSessionId: string | null = null;
  private currentProjectId: string | null = null;
  private currentRevision: number = 1;
  private lastArtworkUri: string | null = null;
  private lastVectorSvg: string | null = null;
  private ws: WebSocket | null = null;

  private constructor() {
    this.checkStatus();
    setInterval(() => this.checkStatus(), 2500);
    this.initWebSocket();
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

  private notify(type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR' | 'REVISION_CONFLICT', data?: any) {
    for (const handler of this.listeners) {
      try {
        handler({ type, data });
      } catch (err) {
        console.error('Erro no listener da bridge Illustrator:', err);
      }
    }
  }

  public getStatus(): BridgeStatus {
    return { ...this.status };
  }

  public isPaired(): boolean {
    return true;
  }

  public getLastArtworkUri(): string | null {
    return this.lastArtworkUri;
  }

  public getLastVectorSvg(): string | null {
    return this.lastVectorSvg;
  }

  public getActiveSession(): { sessionId: string | null; projectId: string | null; revision: number } {
    return {
      sessionId: this.currentSessionId,
      projectId: this.currentProjectId,
      revision: this.currentRevision,
    };
  }

  private setState(state: BridgeConnectionState, label: string, error?: { code: string; message: string }) {
    this.status.state = state;
    this.status.stateLabel = label;
    if (error) {
      this.status.lastError = {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    } else if (state === 'CONNECTED' || state === 'SYNCHRONIZED') {
      this.status.lastError = null;
    }
    this.notify('STATUS_CHANGED', this.status);
  }

  private initWebSocket() {
    if (typeof window === 'undefined') return;
    const wsUrl = 'ws://127.0.0.1:48123';
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.status.bridgeOnline = true;
        this.setState('CONNECTED', 'Conectado');
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ARTWORK_UPDATED') {
            const rawData = msg.data || {};
            const uri = rawData.textureDataUri || msg.data;
            const incomingProjectId = rawData.projectId;
            const incomingRevision = rawData.projectRevision;

            // Verificação de conflito de revisão (Seção 15)
            if (
              this.currentProjectId &&
              incomingProjectId &&
              incomingProjectId !== this.currentProjectId
            ) {
              console.warn(
                `[Bridge] Conflito de Projeto: recebido ${incomingProjectId}, ativo ${this.currentProjectId}`
              );
              this.setState('VERSION_CONFLICT', 'Conflito de versão', {
                code: BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT,
                message: `Arte recebida para projeto diferente (${incomingProjectId} != ${this.currentProjectId})`,
              });
              this.notify('REVISION_CONFLICT', {
                incomingProjectId,
                activeProjectId: this.currentProjectId,
              });
              return;
            }

            if (
              incomingRevision !== undefined &&
              this.currentRevision > 1 &&
              incomingRevision < this.currentRevision
            ) {
              console.warn(
                `[Bridge] Conflito de Revisão: recebido rev ${incomingRevision}, ativo rev ${this.currentRevision}`
              );
              this.setState('VERSION_CONFLICT', 'Conflito de versão', {
                code: BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT,
                message: `Arte defasada (rev ${incomingRevision} < atual rev ${this.currentRevision})`,
              });
              this.notify('REVISION_CONFLICT', {
                incomingRevision,
                activeRevision: this.currentRevision,
              });
              return;
            }

            if (uri || rawData.vectorSvg) {
              if (uri) this.lastArtworkUri = uri;
              if (rawData.vectorSvg) this.lastVectorSvg = rawData.vectorSvg;
              this.setState('SYNCHRONIZED', 'Sincronizado');
              this.notify('ARTWORK_UPDATED', rawData);
            }
          }
        } catch (err) {
          console.error('[Bridge] Erro ao processar mensagem WebSocket:', err);
        }
      };
      this.ws.onclose = () => {
        if (this.status.bridgeOnline) {
          this.setState('DISCONNECTED', 'Plugin não conectado');
        }
        setTimeout(() => this.initWebSocket(), 4000);
      };
      this.ws.onerror = () => {
        // Fallback silencioso para reconexão
      };
    } catch {}
  }

  public async pairWithOtp(_pairingCode: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Conexão automática ativa!' };
  }

  public async revokeSession(): Promise<void> {
    this.status.authenticated = true;
    this.currentSessionId = null;
  }

  public async checkStatus(): Promise<BridgeStatus> {
    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(`${url}/api/status`, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.status.authenticated = true;
          this.status.illustratorDetected = !!data.illustratorDetected;

          if (!data.illustratorDetected) {
            this.setState('ILLUSTRATOR_NOT_FOUND', 'Illustrator não encontrado');
          } else {
            this.setState('CONNECTED', 'Conectado');
          }

          if (data.latestArtworkDataUri && data.latestArtworkDataUri !== this.lastArtworkUri) {
            this.lastArtworkUri = data.latestArtworkDataUri;
            this.notify('ARTWORK_UPDATED', { textureDataUri: this.lastArtworkUri });
          }

          return this.status;
        }
      } catch {}
    }

    if (this.status.bridgeOnline) {
      this.status.bridgeOnline = false;
      this.setState('DISCONNECTED', 'Plugin não conectado');
    }
    return this.status;
  }

  /**
   * BOTÃO 1: ABRIR NO ILLUSTRATOR
   * Envia o projeto com faca canônica e arte para o Adobe Illustrator
   */
  public async openInIllustrator(
    project: IllustratorProjectPayload
  ): Promise<{ success: boolean; message: string; errorCode?: string; isFallback?: boolean }> {
    // 1. Validação estrita de contrato de dados (Fase 6 — Seção 6)
    const validation = validateIllustratorPayload(project);
    if (!validation.valid) {
      const err = {
        code: BRIDGE_ERROR_CODES.ILLUSTRATOR_PAYLOAD_INVALID,
        message: `Payload inválido: ${validation.errors.join('; ')}`,
      };
      this.setState('CONNECTION_ERROR', 'Payload inválido', err);
      return { success: false, message: err.message, errorCode: err.code };
    }

    // Registra sessão e revisão ativa
    this.currentProjectId = project.projectId;
    this.currentSessionId = project.illustratorSessionId;
    this.currentRevision = project.projectRevision;
    this.status.activeProjectId = project.projectId;
    this.status.activeSessionId = project.illustratorSessionId;
    this.status.activeRevision = project.projectRevision;

    this.setState('SENDING', 'Enviando...');

    const jsxCode = project.jsx || generateIllustratorJsx(project);
    const payload = { ...project, jsx: jsxCode, targetApp: 'illustrator' };

    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        const res = await fetch(`${url}/api/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const result = await res.json();
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.setState('RECEIVED', 'Recebido');
          setTimeout(() => this.setState('CONNECTED', 'Conectado'), 1500);

          return {
            success: result.success !== false,
            message: result.message || 'Faca canônica aberta com sucesso no Adobe Illustrator!',
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.message || errData.error || 'Falha ao processar abertura no Illustrator.';
          const code = BRIDGE_ERROR_CODES.ILLUSTRATOR_EXPORT_FAILED;
          this.setState('CONNECTION_ERROR', 'Erro de conexão', { code, message: errMsg });
          return { success: false, message: errMsg, errorCode: code };
        }
      } catch (err: any) {
        // Tenta próxima URL
      }
    }

    const unavailErr = {
      code: BRIDGE_ERROR_CODES.ILLUSTRATOR_BRIDGE_UNAVAILABLE,
      message: 'Não foi possível conectar à Bridge local (127.0.0.1:48123). Verifique se ela está ativa.',
    };
    this.setState('CONNECTION_ERROR', 'Erro de conexão', unavailErr);

    return {
      success: false,
      message: unavailErr.message,
      errorCode: unavailErr.code,
      isFallback: true,
    };
  }

  /**
   * BOTÃO 2: ENVIAR ARTE PARA PLMPACKLIB / SINCRONIZAR ARTE
   * Requisita da Bridge a última arte exportada no Illustrator e a associa ao projeto
   */
  public async requestArtworkSync(
    modelId?: string
  ): Promise<{
    success: boolean;
    textureDataUri?: string;
    vectorSvg?: string;
    hasVector?: boolean;
    artworkType?: string;
    message?: string;
    errorCode?: string;
  }> {
    this.setState('CONNECTING', 'Conectando...');

    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${url}/api/latest-artwork`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.hasArtwork && (data.textureDataUri || data.vectorSvg)) {
            // Verifica conflito de projeto se informado
            if (modelId && data.modelId && data.modelId !== modelId) {
              const conflictErr = {
                code: BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT,
                message: `Arte pertence ao modelo ${data.modelId}, mas o modelo ativo é ${modelId}.`,
              };
              this.setState('VERSION_CONFLICT', 'Conflito de versão', conflictErr);
              return { success: false, message: conflictErr.message, errorCode: conflictErr.code };
            }

            this.lastArtworkUri = data.textureDataUri || null;
            this.lastVectorSvg = data.vectorSvg || null;
            this.setState('SYNCHRONIZED', 'Sincronizado');
            this.notify('ARTWORK_UPDATED', {
              textureDataUri: data.textureDataUri,
              vectorSvg: data.vectorSvg,
              hasVector: data.hasVector,
              artworkType: data.artworkType,
              projectId: data.projectId,
              modelId: data.modelId,
            });
            return {
              success: true,
              textureDataUri: data.textureDataUri,
              vectorSvg: data.vectorSvg,
              hasVector: data.hasVector,
              artworkType: data.artworkType,
              message: data.hasVector ? 'Arte vetorial e preview sincronizados com sucesso!' : 'Preview raster sincronizado com sucesso!',
            };
          }
        }
      } catch {}
    }

    const notFoundErr = {
      code: BRIDGE_ERROR_CODES.ILLUSTRATOR_IMPORT_FAILED,
      message: 'Nenhuma arte sincronizada encontrada na Bridge. Exporte a camada ARTWORK no Illustrator.',
    };
    this.setState('CONNECTED', 'Conectado', notFoundErr);
    return { success: false, message: notFoundErr.message, errorCode: notFoundErr.code };
  }

  /**
   * Faz o download direto do arquivo de script .jsx compilado para o Illustrator (Fallback manual)
   */
  public downloadJsxFile(project: IllustratorProjectPayload): void {
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
      console.error('Erro ao baixar script do Illustrator:', e);
    }
  }
}
