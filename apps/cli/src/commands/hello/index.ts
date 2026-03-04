import { Args, Command, Flags } from "@oclif/core";

export default class Hello extends Command {
  static args = {
    person: Args.string({
      description: "Person to say hello to",
      required: false,
      default: "world",
    }),
  };
  static description = "Say hello";
  static examples = [
    `<%= config.bin %> <%= command.id %> marco --from cli
hello marco from cli!
`,
    `<%= config.bin %> <%= command.id %> --backend-url http://localhost:4000
backend says: Hello from Fastify
`,
  ];
  static flags = {
    from: Flags.string({
      char: "f",
      description: "Who is saying hello",
      default: "cli",
    }),
    "backend-url": Flags.string({
      description: "Optional backend URL to ping /hello",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Hello);
    const backendUrl = flags["backend-url"];

    this.log(`hello ${args.person} from ${flags.from}!`);

    if (backendUrl) {
      try {
        const response = await fetch(`${backendUrl}/hello`);
        if (!response.ok) {
          this.error(`Backend returned ${response.status}`);
        }

        const payload = (await response.json()) as { message: string };
        this.log(`backend says: ${payload.message}`);
      } catch (error) {
        this.error(
          `Failed to reach backend at ${backendUrl}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }
  }
}
