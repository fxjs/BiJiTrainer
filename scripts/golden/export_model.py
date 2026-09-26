"""导出 ThinkBiJi 训练好的摆牌模型（model.pkl）与其摆法选择，作为 TS 求解器的对拍基准。

输出两个文件（写入 packages/solver/test/fixtures/）：
- python-model.json：每个不同强度值在三道的单挑胜率 p 与拿第一概率 top，格式同 TS 的 LaneTable
- python-policy.json：固定种子抽取的随机手牌，及 Python 在 top / duel / greedy 三种策略下选出的三道强度

参考实现路径可用环境变量 THINKBIJI_SIM 指定，默认 ../ThinkBiJi/sim（相对本仓库根目录）。
"""
import json
import os
import pickle
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIM = os.environ.get("THINKBIJI_SIM", os.path.join(ROOT, "..", "ThinkBiJi", "sim"))
sys.path.insert(0, SIM)
import biji_sim as S  # noqa: E402

OUT = os.path.join(ROOT, "packages", "solver", "test", "fixtures")
HANDS = 2000
SEED = 20260926

with open(os.path.join(SIM, "model.pkl"), "rb") as fh:
    dists, maxima = pickle.load(fh)
model = S.Model(dists, maxima)

strengths = sorted(set(S.STRENGTH.values()))
table = {
    "version": 1,
    "source": "ThinkBiJi/sim/model.pkl",
    "deals": len(dists[0]) // 6,
    "strengths": strengths,
    # 道的顺序：尾、中、头
    "lanes": [{"p": [model.p[k](s) for s in strengths], "top": [model.top[k](s) for s in strengths]} for k in range(3)],
}
with open(os.path.join(OUT, "python-model.json"), "w") as fh:
    json.dump(table, fh, separators=(",", ":"))

rng = random.Random(SEED)
cases = []
for _ in range(HANDS):
    hand = sorted(rng.sample(S.DECK, 9))
    cases.append({"hand": hand, **{p: list(S.arrange(hand, model, p)) for p in ("top", "duel", "greedy")}})
with open(os.path.join(OUT, "python-policy.json"), "w") as fh:
    json.dump(cases, fh, separators=(",", ":"))
