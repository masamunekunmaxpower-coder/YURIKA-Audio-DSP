# YURIKA Audio DSP 3.3.2 日本語README

> **『トリッカル・もちもちほっぺ大作戦』同人作品 / 非公式ファンプロジェクト**  
> TRICKCAL / EPIDGames / BILIBILI の公式製品・公式配布物ではありません。

YURIKA Audioは、**Chrome上でリアルタイム動作するオーディオDSPシステム**です。

単純なEQや音量ブースターではなく、Chrome Manifest V3、Web Audio API、AudioWorklet、Self-DAP、HRTF立体音響、ヘッドホン補正、適応制御、安全処理、C++ / WebAssembly仮想アンプ、診断機構を一つの拡張機能へ統合しています。

## 主な機能

- Chromeタブ音声のリアルタイムDSP処理
- Self-DAP
- HRTF対応Spatial Audio
- ヘッドホン補正
- Width / Perspective / Room処理
- Adaptive Level / Trim / Limiter / Safety
- C++ → WebAssembly DSP SDK
- C++/WASM Virtual Class-A Amp
- Peak / RMS / Stereo Correlation / ITD / ILD / IACC診断
- YouTube A/V同期補助
- DSP障害時のunity bypass

## 内部測定値

以下は**プロジェクト内Evaluatorによる内部測定**であり、第三者試験機関による認証値ではありません。

| 項目 | 結果 |
|---|---:|
| Neutral SI-SDR | **149.49 dB** |
| Neutral FR flatness | **0.00 dB** |
| Virtual Amp THD+N | **-101.10 dB** |
| Virtual Amp S/N | **121.34 dB / 124.95 dBA** |
| Virtual Amp クロストーク | **約 -120 dB** |
| Virtual Amp FR flatness | **0.00000 dB** |
| Virtual Amp 最大位相誤差 | **0.0000°** |
| HRTF段 方位cue-proxy MAE | **0.04°** |
| Full HRTF + Spatial 方向符号精度 | **100%** |

方位角関連の数値は**信号上のcue保持を調べるproxy**であり、人間の実聴定位誤差そのものではありません。

## インストール

1. このリポジトリをダウンロードまたはCloneします。
2. Chromeで `chrome://extensions` を開きます。
3. **デベロッパーモード**をONにします。
4. **パッケージ化されていない拡張機能を読み込む**を選びます。
5. `extension/` フォルダを指定します。
6. YouTubeなど対象タブでYURIKA Audioを開き、DSPを有効化します。

Chrome 116以上を想定しています。

## Virtual Ampについて

Virtual Ampは、派手に音を変えるサチュレーターではなく、**非常に透明な最終出力段**として設計されています。

C++/WASMでごく小さな非線形、低ノイズ、約-120 dBのチャンネル間結合を加えつつ、周波数特性と位相は内部ベンチ上ほぼ維持します。Neutral / Flatでは自動的にバイパスされます。

## 検索用キーワード

Chrome拡張、オーディオDSP、Web Audio、AudioWorklet、WebAssembly、WASM、C++、HRTF、立体音響、Spatial Audio、ヘッドホン、リアルタイム音声処理、仮想アンプ、トリッカル、同人作品。

## 関連資料

- [English README](README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Benchmarks](docs/BENCHMARKS.md)
- [Notice](NOTICE.md)
- [Security](SECURITY.md)

## ライセンス

現時点ではオープンソースライセンスを付与していません。ソースコードは閲覧可能ですが、再利用・再配布の権利は明示的には許諾していません。第三者由来の測定データ、名称、商標等は各権利者に帰属します。
