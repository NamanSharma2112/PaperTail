export function SdkSnippet({ projectId, appUrl }: { projectId: string; appUrl: string }) {
  return (
    <figure>
      <pre className="mono overflow-x-auto rounded-xl bg-[#0f1b2d] p-5 text-[12.5px] leading-relaxed text-[#e8ebf2] shadow-float">
        <span className="text-[#8b97ad]"># 1. Install the recorder (Python 3.7+, no dependencies)</span>{"\n"}pip install &quot;papertrail @ git+https://github.com/NamanSharma2112/PaperTail#subdirectory=packages/python-sdk&quot;{"\n\n"}
        <span className="text-[#8b97ad]"># 2. Point it at this project (token from Settings → Ingestion tokens)</span>{"\n"}export PAPERTRAIL_URL=<span className="text-[#ffb98f]">{appUrl}</span>{"\n"}export PAPERTRAIL_PROJECT=<span className="text-[#9fd7b9]">{projectId}</span>{"\n"}export PAPERTRAIL_TOKEN=<span className="text-[#ffb98f]">pt_…</span>{"\n\n"}
        <span className="text-[#8b97ad]"># 3a. Wrap a command you already run (the code is not edited)</span>{"\n"}papertrail run --group cora --seed 0 --metric &apos;test_accuracy=accuracy= ([0-9.]+)&apos; -- python train.py{"\n\n"}
        <span className="text-[#8b97ad]"># 3b. Or log from your own Python code</span>{"\n"}from papertrail import Experiment{"\n"}with Experiment(name=&quot;baseline&quot;, group=&quot;cora&quot;, seed=42) as exp:{"\n"}    exp.log_params({"{"}&quot;learning_rate&quot;: 0.01{"}"}){"\n"}    exp.log_metrics({"{"}&quot;test_accuracy&quot;: train_and_evaluate(){"}"})
      </pre>
      <figcaption className="figcap mt-2"><b>FIG.</b>Recording runs. Only metadata, metrics and small files you choose are sent; your code and data stay on your machine.</figcaption>
    </figure>
  );
}
