Xinyu Zhong is an incoming Master student at Southeast University (2027 Fall). She is currently a senior undergraduate majoring in Software Engineering at Central South University, ranking 21/206 with a GPA of 90.52/100. Her research focuses on **LLM code security** and **retrieval-augmented generation**, with a first-author paper submitted to **ACL 2026** and a co-authored paper published in **TOSEM (CCF-A)**.

## 🔬 Research

### SAFENOTE: Failure-Driven Self-Evolving Secure Code Generation (First Author, under review at ACL 2026)

Large language models face a **security-functionality trade-off** when generating code. SAFENOTE is the first self-evolving secure generation framework guided by failure experience, turning abstract security guidelines into concrete lessons learned from past mistakes.

- **Dual-notebook architecture:** a Security Error Notebook and a Function Error Notebook store security- and functionality-related failure experiences separately.
- **Contrastive guidance at inference:** beyond retrieving positive security knowledge, similar failure cases are retrieved as negative-positive contrastive examples, forcing the model to explicitly avoid known security pitfalls while aligning with functional requirements.
- **Online evolution with semantic-driven merging:** a similarity-based merging algorithm maintains high information density and retrieval efficiency while continuously capturing new failure cases.

Evaluated on **CodeGuard+**, **LiveCodeBench**, and **CWEval** across five mainstream LLMs (GPT-4o, DeepSeek-V3.2, Llama-3-8B, etc.), SAFENOTE significantly improves security without sacrificing functional correctness. On CodeGuard+, SP@1 (the joint security-functionality metric) improves by **6.49%** (GPT-4o) and **5.96%** (DeepSeek-V3.2), with security-rate gains of **11.17%** and **13.64%** respectively.

### History-Retrieval-Augmented Commit Message Generation (Third Author, published in TOSEM, CCF-A)

- Designed and conducted the multi-dimensional human evaluation of the HISRAG framework: built the quantitative questionnaire, organized blind reviews by senior developers, and statistically validated the model's acceptance and effectiveness in real-world development scenarios.

## 🧺 Selected Project

- **MediChat — An AIGC-based Medical Dialogue Platform** (2024–2025, core member)
  Built the skin-disease diagnosis module: transfer learning with Inception v3 on the XiangyaDerm dataset from Xiangya Hospital (543 diseases, 150,223 clinical images), delivering condition prediction together with health advice.

## 🛠 Skills

- **Programming:** Python, C/C++, Java
- **CS Fundamentals:** Data Structures, Operating Systems, Computer Networks, Computer Organization
- **Tools:** Git, Linux, MySQL, Overleaf
