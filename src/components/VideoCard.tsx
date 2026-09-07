'use client';

import React, { MouseEvent } from 'react';
import Image from 'next/image';
import { Trash2, Heart } from 'lucide-react';

export interface VideoCardProps {
  id?: string | number;
  title?: string; // 设为可选属性，防止 search/page.tsx 等组件因未传 title 报错
  cover?: string;
  poster?: string;
  rate?: string;
  remarks?: string;
  douban_id?: number;
  year?: string;
  type?: string;
  isBangumi?: boolean;
  from?: string;
  items?: any[];
  query?: string;
  config?: {
    showCheckCircle?: boolean;
    showHeart?: boolean;
  };
  onDelete?: (e: MouseEvent<HTMLElement>) => Promise<void> | void;
  onHeartClick?: (e: MouseEvent<HTMLElement>) => void;
  onClick?: () => void;
  // 索引签名：全面兼容任何其他未显式声明的自定义属性
  [key: string]: any;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  title = '',
  cover,
  poster,
  rate,
  remarks,
  config = {},
  onDelete,
  onHeartClick,
  onClick,
}) => {
  const displayCover = cover || poster || '/placeholder.png';

  const handleDelete = async (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (onDelete) {
      await onDelete(e);
    }
  };

  const handleHeart = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (onHeartClick) {
      onHeartClick(e);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col cursor-pointer overflow-hidden rounded-lg bg-slate-800 transition-transform duration-300 hover:scale-105"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <Image
          src={displayCover}
          alt={title || 'video'}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          className="object-cover transition-transform duration-300 group-hover:scale-110"
        />
        {rate && (
          <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-yellow-400 backdrop-blur-md">
            {rate}
          </span>
        )}
        {remarks && (
          <span className="absolute bottom-2 left-2 right-2 truncate rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-md">
            {remarks}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between p-3">
        <h3 className="truncate text-sm font-medium text-white group-hover:text-red-400">
          {title || '暂无标题'}
        </h3>

        <div className="flex items-center space-x-2">
          {config.showCheckCircle && onDelete && (
            <button
              type="button"
              title="删除记录"
              onClick={handleDelete}
              className="flex items-center justify-center p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <Trash2
                size={20}
                className="flex-shrink-0 text-white transition-all duration-300 ease-out hover:stroke-red-500 hover:scale-[1.1]"
              />
            </button>
          )}

          {config.showHeart && (
            <button
              type="button"
              title="收藏"
              onClick={handleHeart}
              className="flex items-center justify-center p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <Heart
                size={20}
                className="flex-shrink-0 text-white transition-all duration-300 ease-out hover:stroke-red-500 hover:scale-[1.1]"
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
