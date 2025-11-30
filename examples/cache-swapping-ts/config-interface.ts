export interface ConfigInterface {
  port: number;
  cacheType: "memory" | "redis";
  redis: {
    host: string;
    port: number;
  };
}
