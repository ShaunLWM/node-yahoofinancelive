import WebSocket from "ws";
import { load, Root } from "protobufjs";
import { EventEmitter } from "events";
import { join } from "path";

export default class YahooFinance<IYahooFinance> extends EventEmitter {
	private _tickers: Array<string>;
	private _ws!: WebSocket;
	private root!: Root;

	constructor(tickers: Array<string>) {
		super();
		this._tickers = tickers;
	}

	get tickers(): Array<string> {
		return this._tickers;
	}

	addTicker(ticker: string | Array<string>, clear = false): void {
		if (clear) this._tickers = [];
		let force = this._tickers.length < 1;
		if (Array.isArray(ticker)) this._tickers.push(...ticker);
		else this._tickers.push(ticker);
		this._tickers = Array.from(new Set(this._tickers));
		this.refresh(force);
	}

	removeTicker(ticker: string = ""): void {
		if (ticker.length < 1) this._tickers = [];
		if (this._tickers.indexOf(ticker) > -1) this._tickers.splice(this._tickers.indexOf(ticker), 1);
		this.refresh();
	}

	async refresh(force = false): Promise<void> {
		if (force) await this.connect();
		if (this.isActive())
			this._ws.send(
				JSON.stringify({
					subscribe: this._tickers,
				})
			);
	}

	async connect(): Promise<void> {
		if (this._tickers.length < 1) return console.error("No tickers found. Autoconnect when ticker is added..");
		try {
			this.root = await load(join(__dirname, "yahoo.proto"));
		} catch (error) {
			throw new Error("Unable to load proto file. Please contact developer");
		}

		if (this.isActive()) return;
		this._ws = new WebSocket("wss://streamer.finance.yahoo.com", {
			origin: "https://finance.yahoo.com",
		});

		this._ws.on("close", () => this.emit("disconnected"));
		this._ws.on("error", (error) => this.emit("error", error));
		this._ws.on("open", async () => {
			await new Promise((r) => setTimeout(r, 3000));
			this.emit("connected");
			this._ws.send(
				JSON.stringify({
					subscribe: this._tickers,
				})
			);
		});

		this._ws.on("message", (data) => {
			try {
				const message = this.root
					.lookupType("YahooFinance.Message")
					.decode(Buffer.from(data.toString(), "base64"));
				this.emit("message", message);
			} catch (error) {
				this.emit("error", error);
			}
		});
	}

	isActive(): boolean {
		return this._ws && this._ws.readyState === WebSocket.OPEN;
	}

	close(): void {
		if (!this._ws) return;
		if (this.isActive()) {
			this._ws.close();
			this._tickers = [];
		}
	}
}
