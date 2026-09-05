# 苹果玻璃风格高科技项目展示 PPT 大纲

项目：基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序  
参考材料：项目源码与文档、现有程序截图、论文《基于微积分切片与指数衰减模型的河流光催化净化动态仿真系统设计与实现》  
页数：22 页  
语言：中文  
比例：16:9  
目标受众：老师、同学、课程项目答辩观众  
核心风格：Apple Liquid Glass、水雾蓝绿、高科技数字孪生、通透玻璃面板、精密数据 HUD、真实程序截图融合  
结构说明：保留 18 个内容页，并为四个核心部分单独加入章节标题页：做项目的原因、需要理解项目的背景知识、Vibe Coding、项目总结。

## Slide 1: 封面 - 河流光催化净化动态仿真程序

- Key points:
  - 项目全名作为主标题
  - 一句话定位：把河流污染治理变成可观察、可计算、可优化的数字孪生实验台
  - 展示微积分、化学动力学、环境科学与 AI 协作开发的融合
  - 论文关键词呼应：河流光催化净化、数字孪生、微积分切片、指数衰减模型、GB 3838-2002、帕累托优化
- Visual idea: 全屏浅色水雾河流背景，中央悬浮透明玻璃标题层，河道中有蓝绿色数据流与光催化粒子
- Layout role and intent: cover
- Required images: none; generate new high-tech hero image

## Slide 2: 章节标题页 01 - 做项目的原因

- Key points:
  - 为什么河流光催化净化需要仿真？
  - 为什么“投在哪里、投多少、什么时候有效”不能只靠经验？
  - 本章回答项目出发点、真实痛点和我们的解决方向
- Visual idea: 极简章节页，大号“01 做项目的原因”，下方一条半透明河流从浑浊红橙渐变到清澈蓝绿
- Layout role and intent: section divider
- Required images: none; generate section divider

## Slide 3: 为什么做这个项目 - 河流治理不是凭感觉就够了

- Key points:
  - 城市化、工业扩张和农业面源污染让地表水面对复合微污染压力
  - 难降解有机物、重金属离子、微塑料等污染物具有低浓度、高毒性、难生化降解特点
  - 真实河流里，流速、河宽、水深、光照、浊度会共同改变净化效率
  - 传统经验投药容易过量、位置不准、成本高，且效果不可预估
  - 项目目标：把“治理决策”转化为“可调参数 + 可视化反馈 + 优化建议”
- Visual idea: 左侧污染河道与风险提示，右侧玻璃面板显示“位置、剂量、光照、流速、浊度”五个变量
- Layout role and intent: problem / motivation
- Required images: none; generate conceptual illustration

## Slide 4: 我们的答案 - 模拟 + 优化 + 可视化

- Key points:
  - 不是静态公式演示，而是全栈式河流光催化净化数字孪生系统
  - 用户输入河段、流速、光照、浊度、污染物和催化剂参数
  - 系统输出浓度变化、最佳投放点、水质等级与优化方案
  - 决策支持层用帕累托前沿回答“更少投药”和“更好净化”的权衡
  - 支持前端即时模拟与后端 API 记录/协同
- Visual idea: 三层架构图：输入参数层、仿真引擎层、可视化决策层
- Layout role and intent: solution overview
- Required images: none; generate architecture-style visual

## Slide 5: 项目全景 - 从河道到决策控制台

- Key points:
  - 展示真实程序界面，说明它不是纸面推导，而是可交互工具
  - 河道画布负责空间直觉：流向、河宽、污染浓度与催化剂位置
  - Dashboard 负责指标、折线、达标判断和优化结果
  - 控制面板负责参数调节、污染物配置与实验设计
- Visual idea: 使用真实程序河道截图作为主视觉，周围加玻璃注释标签
- Layout role and intent: product snapshot / demo preview
- Required images:
  - Main evidence screenshot; strict input asset; preserve UI content and proportions, use as the main product screenshot

    ![程序河道全景截图](/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/river.png)

## Slide 6: 章节标题页 02 - 需要理解项目的背景知识

- Key points:
  - 这个项目横跨高数、化学、物理、环境科学和计算机
  - 本章先建立直觉，再看公式，最后连到程序实现
  - 重点不是推导复杂证明，而是理解每个模型在程序里负责什么
- Visual idea: 大号“02 背景知识”，五个半透明学科节点围绕中央河流数字孪生核心
- Layout role and intent: section divider
- Required images: none; generate section divider

## Slide 7: 背景知识地图 - 这不是单一学科问题

- Key points:
  - 高数：微元法、积分思想、空间离散与沿程积分
  - 化学：半导体光催化、一级反应动力学、羟基自由基氧化
  - 物理：朗伯-比尔光衰减、流速与停留时间、流体连续性
  - 环境科学：GB 3838-2002 水质等级、污染物类型、达标判定
  - 计算机：数字孪生、Canvas 可视化、前后端双引擎、优化算法
- Visual idea: 中央河流数字孪生核心，五个学科节点环绕，线条像 Apple Vision 风格空间 UI
- Layout role and intent: background knowledge map
- Required images: none; generate infographic

## Slide 8: 微积分切片思想 - 把连续河流拆成可计算的小段

- Key points:
  - 将总河流长度按地形分成多个宏观 Segment，再在每段内部离散成微小积分步
  - 每个切片中计算水体停留时间与浓度变化
  - 许多局部变化累积起来，就是整条河的净化过程
  - 公式直觉：delta t = delta x / v
  - 论文补充：固定约 200 个微步用于平衡精度与性能
- Visual idea: 河流被分成细小玻璃切片，每个切片显示局部浓度和流速箭头
- Layout role and intent: concept explanation
- Required images: none; generate math visual

## Slide 9: 指数衰减模型 - 净化效果如何被计算

- Key points:
  - 污染物浓度按一级反应动力学下降
  - 核心公式：C_out = C_in * e^(-k * delta t)
  - k 由催化剂活性、剂量、有效光强等因素共同决定
  - k 越大、停留时间越长，净化越明显
  - 论文补充：二阶指数中点法可减少高活性催化剂下的数值过冲
- Visual idea: 大号公式 + 透明曲线图，污染红色曲线逐渐转为蓝绿色清洁曲线，中间标出“中点校正”
- Layout role and intent: formula hero / model explanation
- Required images: none; generate formula-focused slide

## Slide 10: 光照与浊度 - 光为什么进不去浑水

- Key points:
  - 光催化依赖有效光强，真实水体中悬浮颗粒会吸收和散射光
  - 水越深、越浑浊，光越难到达反应区域
  - 朗伯-比尔直觉：I_eff = I0 * e^(-alpha * d)
  - NTU 不是静态输入，而会随污染浓度形成动态正反馈
  - 论文补充：高浊度可能导致“光遮蔽”与“浊度锁定效应”
- Visual idea: 光束穿过不同深度和浊度的水体，强度逐层衰减，右侧显示透明公式卡与 NTU 正反馈环
- Layout role and intent: scientific background
- Required images: none; generate physics visual

## Slide 11: 流速、河宽与停留时间

- Key points:
  - 流速快，污染物停留时间短，单段反应不充分
  - 流速慢，停留时间长，但扩散和地形会影响局部效率
  - 连续性方程 Q = v * A 用于解释宽度、水深和速度关系
  - 湖泊段、浅滩段、汇合段会改变局部停留时间和混合方式
  - 论文补充：双河汇合使用截面积加权混合，保证质量守恒
- Visual idea: 不同河段宽度、水深与流速箭头组成的透明剖面图，汇合处显示质量守恒混合
- Layout role and intent: scientific background
- Required images: none; generate flow mechanics visual

## Slide 12: 仿真引擎 - 从参数到河道浓度场

- Key points:
  - 输入：河段几何、污染物排放、催化剂投放、环境参数
  - 计算：逐段采样、局部衰减、浊度反馈、温度修正、汇合混合
  - 输出：每段出水浓度、NTU、水质等级、画布路径点
  - 代码实现强调物理坐标与渲染坐标分离
  - 论文补充：TypeScript v4 与 Python v4 双引擎功能对等
- Visual idea: 数据管线图，从参数控制器流向 TypeScript / Python 仿真核心，再流向 Canvas 和 Dashboard
- Layout role and intent: technical architecture
- Required images: none; generate system diagram

## Slide 13: 自动投药优化 - 找到更少投药、更好净化的方案

- Key points:
  - 工程目标不是单纯“越多越好”，而是寻找投药次数与最终浓度的平衡
  - 每个投药点包含段落索引、段内位置、活性、剂量四类参数
  - 先用网格搜索快速找候选投药点
  - 再用 Nelder-Mead 对位置、剂量、活性做连续精修
  - 输出帕累托前沿并自动推荐达标方案
- Visual idea: 左侧算法流程，右侧帕累托曲线，最优点发光标记
- Layout role and intent: algorithm explanation
- Required images: none; generate optimization visual

## Slide 14: 优化结果长什么样 - 帕累托前沿

- Key points:
  - 横轴：投药次数 N
  - 纵轴：最终污染物浓度
  - 达标方案优先选择投药次数最少的点
  - 如果全部不达标，则推荐最终浓度最低的方案
  - 论文补充：苏州河工业废水场景中，N=3 可逼近 I 类水阈值，N=5 边际收益明显下降
- Visual idea: 使用真实程序帕累托图截图为主体，加上解释气泡和达标线标注
- Layout role and intent: data evidence
- Required images:
  - Main evidence chart screenshot; strict input asset; preserve chart content, axes, labels, colors, and data

    ![帕累托前沿图表截图](/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/chart.png)

## Slide 15: 水质达标判定 - 从“看起来清”到“指标合格”

- Key points:
  - 引入 GB 3838-2002 地表水等级思路
  - I 类、II 类、III 类、IV 类、V 类、劣 V 类形成六级水质分类
  - 用残留比例与 WQI 形成清晰的达标状态
  - 系统支持给定目标水质等级后反向计算所需投药量
  - 把仿真结果翻译成观众容易理解的环境结论
- Visual idea: 使用真实水质等级卡截图，配信号灯式玻璃状态环
- Layout role and intent: standard / compliance
- Required images:
  - Main evidence standard screenshot; strict input asset; preserve labels, water quality class, values, and UI content

    ![水质达标卡截图](/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/standard.png)

## Slide 16: 技术实现 - React 前端 + FastAPI 后端

- Key points:
  - React + TypeScript 构建交互式仿真工作台
  - Canvas 负责 11 层河流渲染管线：地貌、水体、浓度场、波纹、催化剂信标、图例等
  - Chart.js 展示浓度、NTU、河宽、帕累托前沿等数据
  - FastAPI 提供仿真、优化、分类、反算剂量、场景保存、历史记录、WebSocket 协同
  - SQLite + SQLAlchemy 记录场景与仿真历史
- Visual idea: 透明技术栈卡片矩阵，React、Canvas、Chart.js、FastAPI、SQLite、WebSocket
- Layout role and intent: implementation architecture
- Required images: none; generate tech stack visual

## Slide 17: 章节标题页 03 - Vibe Coding 介绍

- Key points:
  - 这一部分解释项目是怎样通过 AI 协作快速迭代出来的
  - 重点不是炫技，而是说明“人负责判断，AI 加速落地”
  - 从自然语言想法到可运行系统，是本项目的另一条主线
- Visual idea: 大号“03 Vibe Coding”，玻璃工作台上漂浮自然语言提示、代码片段和项目界面缩略图
- Layout role and intent: section divider
- Required images: none; generate section divider

## Slide 18: Vibe Coding 是什么

- Key points:
  - 用自然语言和 AI 进行结对开发
  - 人负责目标、判断、审美与验收
  - AI 负责快速生成、重构、测试和补全工程细节
  - 关键不是“让 AI 全做”，而是形成高速反馈循环
  - 本项目中，人类负责科学合理性与最终表达，AI 辅助工程实现和迭代
- Visual idea: 人类想法气泡与 AI 代码流在玻璃工作台上汇合，形成项目原型
- Layout role and intent: vibe coding introduction
- Required images: none; generate conceptual visual

## Slide 19: 我们如何 Vibe 出这个项目

- Key points:
  - 从一句项目想法开始，逐步拆成模型、界面、后端、优化、展示
  - AI 帮助把抽象需求变成可运行代码和可视化界面
  - 人不断检查：物理逻辑是否合理、界面是否好用、展示是否清楚
  - 迭代结果：从公式演示变成完整数字孪生控制台
  - 论文、代码和 PPT 最终互相补强：理论更完整，程序更可讲，展示更可信
- Visual idea: 时间线：想法 -> v1 模型 -> v4 物理引擎 -> 自动优化 -> 苹果玻璃界面 -> 学术论文 -> PPT 展示
- Layout role and intent: process timeline
- Required images:
  - Supporting product screenshot; strict input asset; preserve UI content, use as evidence of the final interface

    ![投药配置截图](/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/dosing.png)

## Slide 20: 章节标题页 04 - 项目总结

- Key points:
  - 回收前面三条线索：为什么做、懂什么知识、怎么做出来
  - 为最后的价值、局限和致谢做铺垫
  - 形成清晰的答辩收束感
- Visual idea: 大号“04 项目总结”，清澈河流穿过透明数据面板，远处出现绿色达标光环
- Layout role and intent: section divider
- Required images: none; generate section divider

## Slide 21: 项目价值与局限

- Key points:
  - 价值 1：把高数、化学、物理、环境科学连接成可交互系统
  - 价值 2：让投药位置与剂量优化变得直观可解释
  - 价值 3：展示 AI 协作开发在学生项目中的效率
  - 论文贡献：揭示动态浊度正反馈和“光学突变阈值”对光催化治理的支配作用
  - 局限：当前仍是一维沿程降维模型，深水湖泊三维流场和多重米氏散射尚未完整纳入
  - 后续方向：真实 GIS、2.5D/3D 流场、更多水质指标、实验数据反推模型
- Visual idea: 左侧价值三角，右侧局限与未来方向路线图
- Layout role and intent: project evaluation
- Required images: none; generate summary visual

## Slide 22: 总结 - 让治理方案先在数字河流中跑一遍

- Key points:
  - 我们用微积分切片描述空间变化
  - 用指数衰减描述净化过程
  - 用光照、浊度、流速和地形解释真实水体中的复杂性
  - 用优化算法寻找更好的投药方案
  - 用 vibe coding 加速从想法到系统的落地
  - 最终交付一个可演示、可解释、可扩展的河流光催化净化仿真程序
- Visual idea: 清澈河流、透明控制台、绿色达标光环，结尾有“谢谢”与演示入口提示
- Layout role and intent: closing / summary
- Required images: none; generate closing visual

## Required Source Image Mapping Summary

- Slide 5: `/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/river.png`
  - Role: 主程序截图，展示河道全景与可视化控制台
  - Fidelity: 严格保留截图内容，不重画 UI，不改变文字和图表数据
- Slide 14: `/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/chart.png`
  - Role: 帕累托前沿证据图
  - Fidelity: 严格保留图表轴、标签、曲线、颜色与数值
- Slide 15: `/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/standard.png`
  - Role: 水质等级/达标判断证据图
  - Fidelity: 严格保留等级、数值、标签和 UI 内容
- Slide 19: `/Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序/presentation/assets/screenshots/dosing.png`
  - Role: 投药配置与最终界面证据图
  - Fidelity: 严格保留截图内容，不重画 UI

## Paper Content Incorporated

- 论文摘要与结论：数字孪生系统、全栈双引擎、动态浊度正反馈、帕累托优化。
- 引言与综述：复合微污染、光催化技术工程瓶颈、传统水质模型局限、GB 3838-2002。
- 方法：微积分切片、二阶指数中点法、朗伯-比尔光衰减、阿伦尼乌斯温度修正、催化剂羽流扩散、多污染物矩阵。
- 架构：React 19 + TypeScript、Python + FastAPI、SQLite、WebSocket、11 层 Canvas 渲染管线。
- 实验与讨论：五类极端水文场景、多污染物响应差异、苏州河帕累托优化验证、局限与未来方向。

## Notes

- 本大纲为确认稿草案；确认前不生成 `deck_spec.json`、`speech.md`、`prompts/`、`origin_image/` 或最终 `.pptx`。
- 除 Slide 5、14、15、19 使用严格截图素材外，其余页面将按统一视觉风格生成新的 16:9 高科技图片页。
- 论文 `.docx` 未包含嵌入图片，因此只作为内容来源，不作为必须保留原图的视觉素材。
