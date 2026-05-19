import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export interface DashboardProps {
  gridData: number[][];
  optX: number;
  optY: number;
  directionAngle: number;
}

export function Dashboard({ gridData, optX, optY, directionAngle }: DashboardProps) {
  // 提取沿流向（近似X轴）的浓度衰减数据
  const dataPoints = [];
  const labels = [];
  
  if (gridData && gridData.length > 0 && optY < gridData.length) {
    for (let x = optX; x < gridData[0].length; x++) {
      labels.push(`${x - optX}m`);
      dataPoints.push(gridData[optY][x]);
    }
  }

  const data = {
    labels,
    datasets: [
      {
        label: '中心流线污染物浓度',
        data: dataPoints,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: '指数衰减曲线图' },
    },
    scales: {
      y: { min: 0, max: 1.0, title: { display: true, text: '相对浓度' } }
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mt-4">
      <Line options={options} data={data} />
      <div className="mt-4 grid grid-cols-2 gap-4 text-center">
        <div className="p-3 bg-blue-50 rounded">
          <p className="text-sm text-blue-600 font-medium">最佳投放点</p>
          <p className="text-2xl font-bold text-blue-900">X: {optX}, Y: {optY}</p>
        </div>
        <div className="p-3 bg-green-50 rounded">
          <p className="text-sm text-green-600 font-medium">终端出水水质 (100m处)</p>
          <p className="text-2xl font-bold text-green-900">
            {dataPoints.length > 0 ? (dataPoints[dataPoints.length - 1] * 100).toFixed(1) + '%' : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
