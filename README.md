# BiJiTrainer

六人比鸡配牌训练。规则与策略依据 [ThinkBiJi](../ThinkBiJi) 讲义，规划见 [docs/PLAN.md](docs/PLAN.md)。

## 结构

- `packages/core`：规则引擎（牌编码、牌型强度、摆法与倒水、喜牌、结算）
- `packages/solver`：胜率表模型、摆牌策略、蒙特卡洛精排、推荐（U = EV − λ·σ）
- `packages/solver/data`：自博弈训练的胜率表与训练统计
- `scripts/tables`：胜率表训练脚本
- `scripts/golden`：从 ThinkBiJi 的 Python 参考实现导出对拍基准

## 测试

```bash
pnpm install
pnpm test      # 含与 Python 参考实现的全组合对拍
pnpm golden    # 重新生成对拍基准，需要 ../ThinkBiJi/sim（含 model.pkl）或环境变量 THINKBIJI_SIM
pnpm tables    # 重新训练胜率表，约 50 秒
```
