import { HubtypeService, INPUT, Input, ServerConfig } from '@botonic/core'
import merge from 'lodash.merge'
import React, { createRef } from 'react'
import { createRoot, Root } from 'react-dom/client'

import {
  BlockInputOption,
  CoverComponentOptions,
  PersistentMenuTheme,
  ThemeProps,
  WebchatSettingsProps,
} from './components/index-types'
import { WEBCHAT } from './constants'
import { CloseWebviewOptions } from './contexts'
import {
  ActionRequest,
  EventArgs,
  SENDERS,
  Typing,
  WebchatMessage,
} from './index-types'
import { msgToBotonic } from './msg-to-botonic'
import { isShadowDOMSupported, onDOMLoaded } from './util/dom'
import { ErrorMessage } from './webchat/index-types'
import { Webchat } from './webchat/webchat'

export interface WebchatAppProps {
  theme?: ThemeProps
  persistentMenu?: PersistentMenuTheme
  coverComponent?: CoverComponentOptions
  blockInputs?: BlockInputOption[]
  enableEmojiPicker?: boolean
  enableAttachments?: boolean
  enableUserInput?: boolean
  enableAnimations?: boolean
  hostId?: string
  shadowDOM?: boolean | (() => boolean)
  defaultDelay?: number
  defaultTyping?: number
  storage?: Storage | null
  storageKey?: string
  onInit?: (app: WebchatApp, args: any) => void
  onOpen?: (app: WebchatApp, args: any) => void
  onClose?: (app: WebchatApp, args: any) => void
  onMessage?: (app: WebchatApp, message: WebchatMessage) => void
  onTrackEvent?: (
    request: ActionRequest,
    eventName: string,
    args?: EventArgs
  ) => Promise<void>
  onConnectionChange?: (app: WebchatApp, isOnline: boolean) => void
  appId?: string
  visibility?: boolean | (() => boolean) | 'dynamic'
  server?: ServerConfig
}

interface WebchatRef {
  addBotResponse: ({
    response,
    session,
    lastRoutePath,
  }: AddBotResponseArgs) => void
  setTyping: (typing: boolean) => void
  addUserMessage: (message: any) => Promise<void>
  updateUser: (userToUpdate: any) => void
  openWebchat: () => void
  closeWebchat: () => void
  toggleWebchat: () => void
  openCoverComponent: () => void
  closeCoverComponent: () => void
  renderCustomComponent: (customComponent: any) => void
  unmountCustomComponent: () => void
  toggleCoverComponent: () => void
  openWebviewApi: (component: any) => void
  setError: (error: ErrorMessage) => void
  setOnline: (online: boolean) => void
  getMessages: () => { id: string; ack: number; unsentInput: Input }[] // TODO: define MessagesJSON
  isOnline: () => boolean
  clearMessages: () => void
  getLastMessageUpdate: () => string
  updateMessageInfo: (msgId: string, messageInfo: any) => void
  updateWebchatSettings: (settings: WebchatSettingsProps) => void
  closeWebview: (options?: CloseWebviewOptions) => Promise<void>
}

interface AddBotResponseArgs {
  response: any
  session?: any
  lastRoutePath?: any
}

export class WebchatApp {
  public theme?: ThemeProps
  public persistentMenu?: PersistentMenuTheme
  public coverComponent?: CoverComponentOptions
  public blockInputs?: BlockInputOption[]
  public enableEmojiPicker?: boolean
  public enableAttachments?: boolean
  public enableUserInput?: boolean
  public enableAnimations?: boolean
  public hostId?: string
  public shadowDOM?: boolean | (() => boolean)
  public defaultDelay?: number
  public defaultTyping?: number
  public storage?: Storage | null
  public storageKey: string
  public onInit?: (app: WebchatApp, args: any) => void
  public onOpen?: (app: WebchatApp, args: any) => void
  public onClose?: (app: WebchatApp, args: any) => void
  public onMessage?: (app: WebchatApp, message: WebchatMessage) => void
  public onTrackEvent?: (
    request: ActionRequest,
    eventName: string,
    args?: EventArgs
  ) => Promise<void>
  public onConnectionChange?: (app: WebchatApp, isOnline: boolean) => void
  public appId?: string
  public visibility?: boolean | (() => boolean) | 'dynamic'
  public server?: ServerConfig
  public webchatRef: React.RefObject<WebchatRef | null>

  private reactRoot: Root | null = null
  private host: (HTMLElement | null) | ShadowRoot = null
  private hubtypeService: HubtypeService

  constructor({
    theme = {},
    persistentMenu,
    coverComponent,
    blockInputs,
    enableEmojiPicker,
    enableAttachments,
    enableUserInput,
    enableAnimations,
    hostId = 'root',
    shadowDOM = false,
    defaultDelay,
    defaultTyping,
    storage,
    storageKey,
    onInit,
    onOpen,
    onClose,
    onMessage,
    onTrackEvent,
    onConnectionChange,
    appId,
    visibility,
    server,
  }: WebchatAppProps) {
    this.theme = theme
    this.persistentMenu = persistentMenu
    this.coverComponent = coverComponent
    this.blockInputs = blockInputs
    this.enableEmojiPicker = enableEmojiPicker
    this.enableAttachments = enableAttachments
    this.enableUserInput = enableUserInput
    this.enableAnimations = enableAnimations

    this.shadowDOM = Boolean(
      typeof shadowDOM === 'function' ? shadowDOM() : shadowDOM
    )
    if (this.shadowDOM && !isShadowDOMSupported()) {
      console.warn('[botonic] ShadowDOM not supported on this browser')
      this.shadowDOM = false
    } // Review this

    this.hostId = hostId || WEBCHAT.DEFAULTS.HOST_ID
    this.defaultDelay = defaultDelay
    this.defaultTyping = defaultTyping
    this.storage = storage === undefined ? localStorage : storage
    this.storageKey = storageKey || WEBCHAT.DEFAULTS.STORAGE_KEY
    this.onInit = onInit
    this.onOpen = onOpen
    this.onClose = onClose
    this.onMessage = onMessage
    this.onTrackEvent = onTrackEvent
    this.onConnectionChange = onConnectionChange
    this.visibility = visibility
    this.server = server
    this.webchatRef = createRef<WebchatRef>()
    this.appId = appId

    this.host = null
    this.reactRoot = null
  }

  createRootElement(host: HTMLElement | null) {
    // Create root element <div id='root'> if not exists
    // Create shadowDOM to root element if needed
    if (host) {
      if (host.id && this.hostId) {
        if (host.id != this.hostId) {
          console.warn(
            `[botonic] Host ID "${host.id}" don't match 'hostId' option: ${this.hostId}. Using value: ${host.id}.`
          )
          this.hostId = host.id
        }
      } else if (host.id) {
        this.hostId = host.id
      } else if (this.hostId) {
        host.id = this.hostId
      }
    } else {
      host = this.hostId ? document.getElementById(this.hostId) : null
    }

    if (!host) {
      host = document.createElement('div')
      host.id = this.hostId!
      if (document.body.firstChild) {
        document.body.insertBefore(host, document.body.firstChild)
      } else {
        document.body.appendChild(host)
      }
    }
    this.host = this.shadowDOM ? host.attachShadow({ mode: 'open' }) : host
  }

  getReactMountNode(
    node?: (HTMLElement | null) | ShadowRoot
  ): Element | DocumentFragment {
    if (!node) {
      node = this.host
    }

    if (node === null) {
      throw new Error('Host element not found')
    }

    // TODO: Review logic of ShadowRoot
    if ('shadowRoot' in node && node.shadowRoot !== null) {
      return node.shadowRoot
    }

    return node
  }

  onInitWebchat(...args: [any]) {
    this.onInit && this.onInit(this, ...args)
  }

  onOpenWebchat(...args: [any]) {
    this.onOpen && this.onOpen(this, ...args)
  }

  onCloseWebchat(...args: [any]) {
    this.onClose && this.onClose(this, ...args)
  }

  async onUserInput({ user, input }) {
    this.onMessage &&
      this.onMessage(this, {
        ...input,
        sentBy: SENDERS.user,
        isUnread: false,
      })
    return this.hubtypeService.postMessage(user, input)
  }

  async onConnectionRegained() {
    return this.hubtypeService.onConnectionRegained()
  }

  onStateChange({ session: { user }, messagesJSON }) {
    const lastMessage = messagesJSON[messagesJSON.length - 1]
    const lastMessageId = lastMessage && lastMessage.id
    const lastMessageUpdateDate = this.getLastMessageUpdate()

    if (this.hubtypeService) {
      this.hubtypeService.lastMessageId = lastMessageId
      this.hubtypeService.lastMessageUpdateDate = lastMessageUpdateDate
    }

    if (!this.hubtypeService && user) {
      this.hubtypeService = new HubtypeService({
        appId: this.appId!,
        user,
        lastMessageId,
        lastMessageUpdateDate,
        onEvent: (event: any) => this.onServiceEvent(event),
        unsentInputs: () =>
          this.webchatRef.current
            ?.getMessages()
            .filter(msg => msg.ack === 0 && msg.unsentInput) || [],
        server: this.server,
      })
    }
  }

  onServiceEvent(event: any) {
    if (event.action === 'connectionChange') {
      this.onConnectionChange && this.onConnectionChange(this, event.online)
      this.webchatRef.current?.setOnline(event.online)
    } else if (event.action === 'update_message_info') {
      this.updateMessageInfo(event.message.id, event.message)
    } else if (event.message?.type === 'update_webchat_settings') {
      this.updateWebchatSettings(event.message.data)
    } else if (event.message?.type === 'sender_action') {
      this.setTyping(event.message.data === Typing.On)
    } else {
      this.onMessage &&
        this.onMessage(this, {
          sentBy: SENDERS.bot,
          ...event.message,
        } as WebchatMessage)
      this.addBotMessage(event.message)
    }
  }

  updateUser(user: any) {
    this.webchatRef.current?.updateUser(user)
  }

  addBotMessage(message: any) {
    message.ack = 0
    message.isUnread = true
    message.sentBy = message.sent_by?.split('message_sent_by_')[1]
    delete message.sent_by
    const response = msgToBotonic(
      message,
      // TODO: Review if is neded allow declar customTypes inside and ouside theme
      // @ts-ignore
      this.theme?.message?.customTypes || this.theme?.customMessageTypes || []
    )

    this.webchatRef.current?.addBotResponse({
      response,
    })
  }

  addBotText(text: string) {
    this.addBotMessage({ type: INPUT.TEXT, data: text })
  }

  addUserMessage(message: any) {
    this.webchatRef.current?.addUserMessage(message)
  }

  addUserText(text: string) {
    this.addUserMessage({ type: INPUT.TEXT, data: text })
  }

  addUserPayload(payload: string) {
    this.addUserMessage({ type: INPUT.POSTBACK, payload })
  }

  setTyping(typing: boolean) {
    this.webchatRef.current?.setTyping(typing)
  }

  open() {
    this.webchatRef.current?.openWebchat()
  }

  close() {
    this.webchatRef.current?.closeWebchat()
  }

  async closeWebview(options?: CloseWebviewOptions) {
    await this.webchatRef.current?.closeWebview(options)
  }

  // TODO: Remove this function because we have open and close functions
  toggle() {
    this.webchatRef.current?.toggleWebchat()
  }

  openCoverComponent() {
    this.webchatRef.current?.openCoverComponent()
  }

  closeCoverComponent() {
    this.webchatRef.current?.closeCoverComponent()
  }

  renderCustomComponent(_customComponent: any) {
    this.webchatRef.current?.renderCustomComponent(_customComponent)
  }

  unmountCustomComponent() {
    this.webchatRef.current?.unmountCustomComponent()
  }

  // TODO: Remove this function because we have openCoverComponent and closeCoverComponent functions
  toggleCoverComponent() {
    this.webchatRef.current?.toggleCoverComponent()
  }

  getMessages() {
    return this.webchatRef.current?.getMessages()
  }

  clearMessages() {
    this.webchatRef.current?.clearMessages()
  }

  async getVisibility() {
    return this.resolveWebchatVisibility({
      appId: this.appId!,
      visibility: this.visibility,
    })
  }

  getLastMessageUpdate() {
    return this.webchatRef.current?.getLastMessageUpdate()
  }

  updateMessageInfo(msgId: string, messageInfo: any) {
    return this.webchatRef.current?.updateMessageInfo(msgId, messageInfo)
  }

  updateWebchatSettings(settings: WebchatSettingsProps) {
    return this.webchatRef.current?.updateWebchatSettings(settings)
  }

  // eslint-disable-next-line complexity
  getComponent(host: HTMLDivElement, optionsAtRuntime: WebchatAppProps = {}) {
    let {
      theme = {},
      persistentMenu,
      coverComponent,
      blockInputs,
      enableAttachments,
      enableUserInput,
      enableAnimations,
      enableEmojiPicker,
      defaultDelay,
      defaultTyping,
      storage,
      storageKey,
      onInit,
      onOpen,
      onClose,
      onMessage,
      onConnectionChange,
      onTrackEvent,
      appId,
      visibility,
      server,
      hostId,
      ...webchatOptions
    } = optionsAtRuntime
    theme = merge(this.theme, theme)
    persistentMenu = persistentMenu || this.persistentMenu
    coverComponent = coverComponent || this.coverComponent
    blockInputs = blockInputs || this.blockInputs
    enableEmojiPicker = enableEmojiPicker || this.enableEmojiPicker
    enableAttachments = enableAttachments || this.enableAttachments
    enableUserInput = enableUserInput || this.enableUserInput
    enableAnimations = enableAnimations || this.enableAnimations
    defaultDelay = defaultDelay || this.defaultDelay
    defaultTyping = defaultTyping || this.defaultTyping
    server = server || this.server
    this.storage = storage || this.storage
    this.storageKey = storageKey || this.storageKey
    this.onInit = onInit || this.onInit
    this.onOpen = onOpen || this.onOpen
    this.onClose = onClose || this.onClose
    this.onMessage = onMessage || this.onMessage
    this.onTrackEvent = onTrackEvent || this.onTrackEvent
    this.onConnectionChange = onConnectionChange || this.onConnectionChange
    this.visibility = visibility || this.visibility
    this.appId = appId || this.appId
    this.hostId = hostId || this.hostId
    this.createRootElement(host)

    return (
      <Webchat
        {...webchatOptions}
        ref={this.webchatRef}
        // @ts-ignore
        host={this.host}
        shadowDOM={this.shadowDOM}
        theme={theme}
        persistentMenu={persistentMenu}
        coverComponent={coverComponent}
        blockInputs={blockInputs}
        enableEmojiPicker={enableEmojiPicker}
        enableAttachments={enableAttachments}
        enableUserInput={enableUserInput}
        enableAnimations={enableAnimations}
        storage={this.storage}
        storageKey={this.storageKey}
        defaultDelay={defaultDelay}
        defaultTyping={defaultTyping}
        onInit={(...args: [any]) => this.onInitWebchat(...args)}
        onOpen={(...args: [any]) => this.onOpenWebchat(...args)}
        onClose={(...args: [any]) => this.onCloseWebchat(...args)}
        onUserInput={(...args: [any]) => this.onUserInput(...args)}
        onStateChange={webchatState => this.onStateChange(webchatState)}
        onTrackEvent={(
          request: ActionRequest,
          eventName: string,
          args?: EventArgs
        ) => this.onTrackEvent && this.onTrackEvent(request, eventName, args)}
        server={server}
      />
    )
  }

  async isWebchatVisible(appId: string): Promise<boolean> {
    try {
      const { status } = await HubtypeService.getWebchatVisibility(appId)
      return status === 200
    } catch (e) {
      return false
    }
  }

  isOnline() {
    return this.webchatRef.current?.isOnline()
  }

  async resolveWebchatVisibility(
    optionsAtRuntime?: WebchatAppProps
  ): Promise<boolean> {
    if (!optionsAtRuntime) {
      // If optionsAtRuntime is not provided, always render the webchat
      return true
    }

    let { appId, visibility } = optionsAtRuntime
    visibility = visibility || this.visibility

    if (visibility === undefined || visibility === true) {
      return true
    }

    if (typeof visibility === 'function' && visibility()) {
      return true
    }

    if (
      appId &&
      visibility === 'dynamic' &&
      (await this.isWebchatVisible(appId))
    ) {
      return true
    }

    return false
  }

  destroy() {
    if (this.hubtypeService) this.hubtypeService.destroyPusher()
    this.reactRoot?.unmount()
    if (this.storage) this.storage.removeItem(this.storageKey)
  }

  async render(dest: HTMLDivElement, optionsAtRuntime?: WebchatAppProps) {
    onDOMLoaded(async () => {
      const isVisible = await this.resolveWebchatVisibility(optionsAtRuntime)
      if (isVisible) {
        const webchatComponent = this.getComponent(dest, optionsAtRuntime)
        const container = this.getReactMountNode(dest)
        this.reactRoot = createRoot(container) // createRoot(container!) if you use TypeScript
        this.reactRoot.render(webchatComponent)
      }
    })
  }
}
