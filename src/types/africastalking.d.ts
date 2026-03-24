declare module 'africastalking' {
  interface SmsService {
    send(options: { to: string[]; message: string; from?: string }): Promise<unknown>;
  }
  interface AfricasTalkingInstance {
    SMS: SmsService;
  }
  function AfricasTalking(options: { apiKey: string; username: string }): AfricasTalkingInstance;
  export = AfricasTalking;
}
