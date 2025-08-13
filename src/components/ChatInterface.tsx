'use client';

import React, { useState, useRef, useEffect } from 'react';
import { IoSend } from 'react-icons/io5';

interface Message {
  sender: 'user' | 'agent';
  text: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom of the chat window on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() === '') return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let url = '/api/chat'; // Next.js API route
      const body = { message: input };

      if (threadId) {
        url = `/api/chat/${threadId}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Backend response:', data);
      
      // Update threadId if it's the first message
      if (!threadId && data.threadId) {
        setThreadId(data.threadId);
      }

      // Extract the agent's response
      let agentResponse = "Sorry, I couldn't get a response from the agent.";
      
      if (data.response) {
        if (data.response.content) {
          agentResponse = data.response.content;
        } else if (typeof data.response === 'string') {
          agentResponse = data.response;
        } else if (data.response.kwargs && data.response.kwargs.content) {
          agentResponse = data.response.kwargs.content;
        } else {
          console.log('Response structure:', JSON.stringify(data.response, null, 2));
          agentResponse = "Response received but content format is unexpected. Check console for details.";
        }
      }

      const agentMessage: Message = { sender: 'agent', text: agentResponse };
      setMessages(prevMessages => [...prevMessages, agentMessage]);

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = { sender: 'agent', text: 'Oops! Something went wrong. Please try again.' };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const Message: React.FC<{ sender: string; text: string }> = ({ sender, text }) => {
    const isUser = sender === 'user';
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`p-3 rounded-lg max-w-[70%] text-sm shadow-md transition-all duration-300 ease-in-out ${
          isUser 
            ? 'bg-blue-500 text-white rounded-br-none' 
            : 'bg-gray-700 text-gray-200 rounded-bl-none'
        }`}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-gray-800 rounded-3xl shadow-xl flex flex-col h-[85vh]">
        
        {/* Chat Header */}
        <div className="p-5 border-b-2 border-gray-700 bg-gray-800 rounded-t-3xl flex items-center">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
            HR
          </div>
          <div className="ml-4 flex-grow">
            <h1 className="text-xl font-bold">HR Chatbot Agent</h1>
            <p className="text-sm text-gray-400">Ask me anything about the employees!</p>
          </div>
        </div>

        {/* Chat Messages Container */}
        <div 
          ref={chatContainerRef} 
          className="flex-grow p-5 overflow-y-auto"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <h2 className="text-lg mb-2">Welcome to your HR Chatbot!</h2>
              <p className="text-sm">Start by asking a question about employee data.</p>
            </div>
          )}
          {messages.map((msg, index) => (
            <Message key={index} sender={msg.sender} text={msg.text} />
          ))}
          {loading && (
            <div className="flex justify-start mb-4">
              <div className="p-3 rounded-lg max-w-[70%] text-sm bg-gray-700 text-gray-200">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input Form */}
        <form onSubmit={handleSendMessage} className="p-4 border-t-2 border-gray-700 flex items-center bg-gray-800 rounded-b-3xl">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here..."
            className="flex-grow p-3 rounded-full bg-gray-700 text-gray-200 border-none outline-none focus:ring-2 focus:ring-blue-500 focus:bg-gray-600 transition-all duration-200"
            disabled={loading}
          />
          <button
            type="submit"
            className="ml-3 p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors duration-200 shadow-lg disabled:bg-blue-400"
            disabled={loading}
          >
            <IoSend className="text-xl" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;