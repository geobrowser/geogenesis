import { Logger, type ILogObj } from "tslog";

class SinkLogger extends Logger<ILogObj> {
  constructor() {
    super();
    this.disable();
    this.setName("substreams-sink");
  }

  public setName(name: string) {
    this.settings.name = name;
  }

  public enable(type: "json" | "pretty" = "pretty") {
    this.settings.type = type;
    this.settings.minLevel = 0;
  }

  public disable() {
    this.settings.type = "hidden";
    this.settings.minLevel = 5;
  }
}

export const logger = new SinkLogger();